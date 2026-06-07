package app

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"central-server/internal/catalog"
	"central-server/internal/config"
	"central-server/internal/db"
	"central-server/internal/httpapi"
	"central-server/internal/store"
)

// App wires configuration, database access, and HTTP serving.
type App struct {
	cfg    config.Config
	db     *sql.DB
	logger *slog.Logger
	server *http.Server
}

// New creates a fully wired application instance.
func New(ctx context.Context, cfg config.Config, logger *slog.Logger) (*App, error) {
	pool, err := db.OpenPostgres(ctx, cfg.Database)
	if err != nil {
		return nil, err
	}

	resources := catalog.Resources()
	gatewayStore := store.New(pool, resources)
	api := httpapi.New(logger, gatewayStore, resources)

	return &App{
		cfg:    cfg,
		db:     pool,
		logger: logger,
		server: &http.Server{
			Addr:              cfg.HTTP.Address(),
			Handler:           api.Handler(),
			ReadHeaderTimeout: 10 * time.Second,
			ReadTimeout:       30 * time.Second,
			WriteTimeout:      30 * time.Second,
			IdleTimeout:       120 * time.Second,
		},
	}, nil
}

// Run starts the HTTP server and gracefully shuts down on process signals.
func (a *App) Run(ctx context.Context) error {
	errs := make(chan error, 1)
	go func() {
		a.logger.Info("starting AI Gateway central server", "address", a.cfg.HTTP.Address())
		if err := a.server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errs <- err
			return
		}
		errs <- nil
	}()

	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM)
	defer signal.Stop(signals)

	select {
	case err := <-errs:
		return err
	case signal := <-signals:
		a.logger.Info("shutdown signal received", "signal", signal.String())
		shutdownCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
		defer cancel()
		if err := a.server.Shutdown(shutdownCtx); err != nil {
			return err
		}
		return a.db.Close()
	}
}
