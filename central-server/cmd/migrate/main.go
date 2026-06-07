// migrate runs pending SQL migrations against the configured database.
// Usage: go run ./cmd/migrate <sql-file> [sql-file ...]
// Environment variables are the same as the main server (AI_GATEWAY_DB_*).
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"

	"central-server/internal/config"
	"central-server/internal/db"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: migrate <sql-file> [sql-file ...]")
		os.Exit(1)
	}

	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	cfg := config.Load()

	pool, err := db.OpenPostgres(context.Background(), cfg.Database)
	if err != nil {
		logger.Error("cannot connect to database", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	for _, path := range os.Args[1:] {
		sql, err := os.ReadFile(path)
		if err != nil {
			logger.Error("cannot read file", "path", path, "error", err)
			os.Exit(1)
		}
		if _, err := pool.ExecContext(context.Background(), string(sql)); err != nil {
			logger.Error("migration failed", "path", path, "error", err)
			os.Exit(1)
		}
		logger.Info("migration applied", "path", path)
	}
}
