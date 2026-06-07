package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"central-server/internal/catalog"
)

// ErrNoColumns reports that a write payload has no whitelisted table columns.
var ErrNoColumns = errors.New("payload does not contain writable columns")

// Store provides whitelisted CRUD access to AI Gateway tables.
type Store struct {
	db        *sql.DB
	resources map[string]catalog.Resource
}

// New creates a Store backed by a PostgreSQL connection pool.
func New(db *sql.DB, resources map[string]catalog.Resource) *Store {
	return &Store{db: db, resources: resources}
}

// Health verifies that the database can answer a simple query.
func (s *Store) Health(ctx context.Context) error {
	var value int
	return s.db.QueryRowContext(ctx, "SELECT 1").Scan(&value)
}

// List returns rows for a resource with optional org_id filtering.
func (s *Store) List(ctx context.Context, resource catalog.Resource, orgID string, limit int, offset int) ([]map[string]any, error) {
	columns := strings.Join(resource.Columns, ", ")
	query := fmt.Sprintf("SELECT %s FROM %s", columns, resource.Table)
	args := []any{}

	if hasColumn(resource, "org_id") && orgID != "" {
		args = append(args, orgID)
		query += fmt.Sprintf(" WHERE org_id = $%d", len(args))
	}

	args = append(args, limit, offset)
	query += fmt.Sprintf(" ORDER BY id LIMIT $%d OFFSET $%d", len(args)-1, len(args))

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanRows(rows)
}

// Get returns a single row by UUID primary key.
func (s *Store) Get(ctx context.Context, resource catalog.Resource, id string) (map[string]any, error) {
	columns := strings.Join(resource.Columns, ", ")
	query := fmt.Sprintf("SELECT %s FROM %s WHERE id = $1", columns, resource.Table)

	rows, err := s.db.QueryContext(ctx, query, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items, err := scanRows(rows)
	if err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, sql.ErrNoRows
	}
	return items[0], nil
}

// Create inserts one row and returns the created record.
func (s *Store) Create(ctx context.Context, resource catalog.Resource, payload map[string]any) (map[string]any, error) {
	columns, values := filterPayload(resource, payload, false)
	if len(columns) == 0 {
		return nil, ErrNoColumns
	}

	placeholders := make([]string, 0, len(columns))
	for i := range columns {
		placeholders = append(placeholders, fmt.Sprintf("$%d", i+1))
	}

	query := fmt.Sprintf(
		"INSERT INTO %s (%s) VALUES (%s) RETURNING %s",
		resource.Table,
		strings.Join(columns, ", "),
		strings.Join(placeholders, ", "),
		strings.Join(resource.Columns, ", "),
	)

	rows, err := s.db.QueryContext(ctx, query, values...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items, err := scanRows(rows)
	if err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, sql.ErrNoRows
	}
	return items[0], nil
}

// Update patches one row by UUID primary key and returns the updated record.
func (s *Store) Update(ctx context.Context, resource catalog.Resource, id string, payload map[string]any) (map[string]any, error) {
	columns, values := filterPayload(resource, payload, true)
	if len(columns) == 0 {
		return nil, ErrNoColumns
	}

	assignments := make([]string, 0, len(columns))
	for i, column := range columns {
		assignments = append(assignments, fmt.Sprintf("%s = $%d", column, i+1))
	}
	values = append(values, id)

	query := fmt.Sprintf(
		"UPDATE %s SET %s WHERE id = $%d RETURNING %s",
		resource.Table,
		strings.Join(assignments, ", "),
		len(values),
		strings.Join(resource.Columns, ", "),
	)

	rows, err := s.db.QueryContext(ctx, query, values...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items, err := scanRows(rows)
	if err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, sql.ErrNoRows
	}
	return items[0], nil
}

// Delete removes one row by UUID primary key.
func (s *Store) Delete(ctx context.Context, resource catalog.Resource, id string) error {
	query := fmt.Sprintf("DELETE FROM %s WHERE id = $1", resource.Table)
	result, err := s.db.ExecContext(ctx, query, id)
	if err != nil {
		return err
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// filterPayload returns safe columns and driver values from a JSON payload.
func filterPayload(resource catalog.Resource, payload map[string]any, skipID bool) ([]string, []any) {
	allowed := map[string]bool{}
	for _, column := range resource.Columns {
		if skipID && column == "id" {
			continue
		}
		allowed[column] = true
	}

	columns := make([]string, 0, len(payload))
	values := make([]any, 0, len(payload))
	for _, column := range resource.Columns {
		if !allowed[column] {
			continue
		}
		value, ok := payload[column]
		if !ok {
			continue
		}
		columns = append(columns, column)
		values = append(values, normalizeValue(value))
	}
	return columns, values
}

// hasColumn reports whether a resource contains a column.
func hasColumn(resource catalog.Resource, column string) bool {
	for _, candidate := range resource.Columns {
		if candidate == column {
			return true
		}
	}
	return false
}

// normalizeValue converts nested JSON values to json.RawMessage for JSONB columns.
func normalizeValue(value any) any {
	switch typed := value.(type) {
	case map[string]any, []any:
		bytes, err := json.Marshal(typed)
		if err != nil {
			return value
		}
		return json.RawMessage(bytes)
	default:
		return value
	}
}

// scanRows converts database rows into JSON-ready maps.
func scanRows(rows *sql.Rows) ([]map[string]any, error) {
	columns, err := rows.Columns()
	if err != nil {
		return nil, err
	}

	items := []map[string]any{}
	for rows.Next() {
		values := make([]any, len(columns))
		targets := make([]any, len(columns))
		for i := range values {
			targets[i] = &values[i]
		}

		if err := rows.Scan(targets...); err != nil {
			return nil, err
		}

		item := map[string]any{}
		for i, column := range columns {
			item[column] = normalizeScanned(values[i])
		}
		items = append(items, item)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

// normalizeScanned converts driver values into JSON-friendly values.
func normalizeScanned(value any) any {
	switch typed := value.(type) {
	case []byte:
		var decoded any
		if json.Unmarshal(typed, &decoded) == nil {
			return decoded
		}
		return string(typed)
	default:
		return typed
	}
}
