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

// List returns rows for a resource with optional column filters.
// filters is a map of column name → value; only columns present in the
// resource definition are applied (unknown keys are ignored).
func (s *Store) List(ctx context.Context, resource catalog.Resource, filters map[string]string, limit int, offset int) ([]map[string]any, error) {
	columns := strings.Join(resource.Columns, ", ")
	query := fmt.Sprintf("SELECT %s FROM %s", columns, resource.Table)
	args := []any{}
	conditions := []string{}

	for _, col := range resource.Columns {
		if val, ok := filters[col]; ok && val != "" {
			args = append(args, val)
			conditions = append(conditions, fmt.Sprintf("%s = $%d", col, len(args)))
		}
	}

	if len(conditions) > 0 {
		query += " WHERE " + strings.Join(conditions, " AND ")
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

// SearchUsers returns users whose name or email contains q (case-insensitive),
// scoped to a single organisation. Results are ordered by name and capped at
// limit. The % wildcard in q is escaped so callers pass plain text.
//
// ctx — controls deadline for the database query.
// orgID — only users belonging to this organisation are returned.
// q — substring to match against name and email (ILIKE %q%).
// limit — maximum rows to return; capped by the caller to a safe value.
func (s *Store) SearchUsers(ctx context.Context, orgID, q string, limit int) ([]map[string]any, error) {
	// Escape literal % and _ so the caller's text is not treated as pattern chars.
	escaped := strings.NewReplacer(`%`, `\%`, `_`, `\_`).Replace(q)
	pattern := "%" + escaped + "%"

	const cols = "id, org_id, email, name, auth_provider, external_id, last_login_at, is_active"
	query := fmt.Sprintf(
		"SELECT %s FROM users WHERE org_id = $1 AND (name ILIKE $2 OR email ILIKE $2) ORDER BY name LIMIT $3",
		cols,
	)

	rows, err := s.db.QueryContext(ctx, query, orgID, pattern, limit)
	if err != nil {
		return nil, fmt.Errorf("store.SearchUsers: %w", err)
	}
	defer rows.Close()

	return scanRows(rows)
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

// Schema returns all public table columns and foreign-key relationships from
// information_schema. It is used by the /api/schema endpoint to generate ERDs.
//
// columns — one row per column ordered by (table_name, ordinal_position).
// foreignKeys — one row per FK column ordered by (table_name, column_name).
func (s *Store) Schema(ctx context.Context) (columns []map[string]any, foreignKeys []map[string]any, err error) {
	colRows, err := s.db.QueryContext(ctx, `
		SELECT table_name, column_name, data_type, is_nullable
		FROM information_schema.columns
		WHERE table_schema = 'public'
		ORDER BY table_name, ordinal_position
	`)
	if err != nil {
		return nil, nil, fmt.Errorf("store.Schema columns: %w", err)
	}
	defer colRows.Close()

	columns, err = scanRows(colRows)
	if err != nil {
		return nil, nil, fmt.Errorf("store.Schema scan columns: %w", err)
	}

	fkRows, err := s.db.QueryContext(ctx, `
		SELECT
			tc.table_name   AS from_table,
			kcu.column_name AS from_column,
			ccu.table_name  AS to_table,
			ccu.column_name AS to_column
		FROM information_schema.table_constraints tc
		JOIN information_schema.key_column_usage kcu
		  ON tc.constraint_name = kcu.constraint_name
		 AND tc.table_schema    = kcu.table_schema
		JOIN information_schema.constraint_column_usage ccu
		  ON ccu.constraint_name = tc.constraint_name
		 AND ccu.table_schema    = tc.table_schema
		WHERE tc.constraint_type = 'FOREIGN KEY'
		  AND tc.table_schema    = 'public'
		ORDER BY tc.table_name, kcu.column_name
	`)
	if err != nil {
		return nil, nil, fmt.Errorf("store.Schema foreign_keys: %w", err)
	}
	defer fkRows.Close()

	foreignKeys, err = scanRows(fkRows)
	if err != nil {
		return nil, nil, fmt.Errorf("store.Schema scan foreign_keys: %w", err)
	}

	return columns, foreignKeys, nil
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
