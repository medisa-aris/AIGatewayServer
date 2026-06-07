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
	"central-server/internal/proxy"
	"central-server/internal/routing"
	"central-server/internal/store"
)

// App wires configuration, database access, and HTTP serving.
type App struct {
	cfg          config.Config
	db           *sql.DB
	logger       *slog.Logger
	server       *http.Server
	proxyManager *proxy.Manager
}

// New creates a fully wired application instance.
func New(ctx context.Context, cfg config.Config, logger *slog.Logger, logLevel *slog.LevelVar) (*App, error) {
	pool, err := db.OpenPostgres(ctx, cfg.Database)
	if err != nil {
		return nil, err
	}

	resources := catalog.Resources()
	gatewayStore := store.New(pool, resources)
	router, err := routing.NewService(gatewayStore, resources, logger)
	if err != nil {
		return nil, err
	}
	executor, err := routing.NewExecutor(gatewayStore, resources, logger)
	if err != nil {
		return nil, err
	}
	proxyManager := proxy.NewManager(gatewayStore, resources, executor, logger)
	api := httpapi.New(logger, logLevel, gatewayStore, router, executor, proxyManager, resources)

	return &App{
		cfg:          cfg,
		db:           pool,
		logger:       logger,
		proxyManager: proxyManager,
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
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	// Start proxy manager in background; it stops automatically when ctx is cancelled.
	go func() {
		if err := a.proxyManager.Run(ctx); err != nil && !errors.Is(err, context.Canceled) {
			a.logger.Warn("proxy manager exited", "error", err)
		}
	}()

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
		cancel() // stop proxy manager
		return err
	case sig := <-signals:
		a.logger.Info("shutdown signal received", "signal", sig.String())
		cancel() // stop proxy manager (closes all endpoint listeners)
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer shutdownCancel()
		if err := a.server.Shutdown(shutdownCtx); err != nil {
			return err
		}
		return a.db.Close()
	}
}
