package db

import (
	"context"
	"database/sql"
	"time"

	"central-server/internal/config"

	_ "github.com/jackc/pgx/v5/stdlib"
)

// OpenPostgres opens and validates a PostgreSQL connection pool.
func OpenPostgres(ctx context.Context, cfg config.DatabaseConfig) (*sql.DB, error) {
	pool, err := sql.Open("pgx", cfg.DSN())
	if err != nil {
		return nil, err
	}

	pool.SetMaxOpenConns(20)
	pool.SetMaxIdleConns(10)
	pool.SetConnMaxLifetime(30 * time.Minute)
	pool.SetConnMaxIdleTime(5 * time.Minute)

	if err := pool.PingContext(ctx); err != nil {
		pool.Close()
		return nil, err
	}

	return pool, nil
}
