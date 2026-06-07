package config

import (
	"fmt"
	"os"
	"strconv"
)

// Config contains runtime settings for the AI Gateway central server.
type Config struct {
	HTTP     HTTPConfig
	Database DatabaseConfig
}

// HTTPConfig contains HTTP listener settings.
type HTTPConfig struct {
	Host string
	Port int
}

// DatabaseConfig contains PostgreSQL connection settings.
type DatabaseConfig struct {
	Host     string
	Port     int
	User     string
	Password string
	Name     string
	SSLMode  string
}

// Load reads configuration from environment variables with development defaults.
func Load() Config {
	return Config{
		HTTP: HTTPConfig{
			Host: envString("AI_GATEWAY_HTTP_HOST", "0.0.0.0"),
			Port: envInt("AI_GATEWAY_HTTP_PORT", 10000),
		},
		Database: DatabaseConfig{
			Host:     envString("AI_GATEWAY_DB_HOST", "localhost"),
			Port:     envInt("AI_GATEWAY_DB_PORT", 5432),
			User:     envString("AI_GATEWAY_DB_USER", "gateway_user"),
			Password: envString("AI_GATEWAY_DB_PASSWORD", "change-me-in-production"),
			Name:     envString("AI_GATEWAY_DB_NAME", "aigateway1"),
			SSLMode:  envString("AI_GATEWAY_DB_SSLMODE", "disable"),
		},
	}
}

// Address returns the HTTP bind address.
func (c HTTPConfig) Address() string {
	return fmt.Sprintf("%s:%d", c.Host, c.Port)
}

// DSN returns a pgx-compatible PostgreSQL connection string.
func (c DatabaseConfig) DSN() string {
	return fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		c.Host,
		c.Port,
		c.User,
		c.Password,
		c.Name,
		c.SSLMode,
	)
}

// envString returns the environment value or fallback when unset.
func envString(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

// envInt returns the parsed environment value or fallback when unset or invalid.
func envInt(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}
