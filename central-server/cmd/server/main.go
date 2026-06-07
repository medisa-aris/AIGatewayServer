package main

import (
	"context"
	"log/slog"
	"os"

	"central-server/internal/app"
	"central-server/internal/config"
)

// main loads configuration, starts the HTTP API, and blocks until shutdown.
func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	cfg := config.Load()

	application, err := app.New(context.Background(), cfg, logger)
	if err != nil {
		logger.Error("failed to create application", "error", err)
		os.Exit(1)
	}

	if err := application.Run(context.Background()); err != nil {
		logger.Error("application stopped with error", "error", err)
		os.Exit(1)
	}
}
