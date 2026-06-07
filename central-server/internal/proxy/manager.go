package proxy

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"sync"
	"time"

	"central-server/internal/catalog"
	"central-server/internal/routing"
)

// DataSource is the minimal read-only store subset the Manager needs to
// discover proxy settings and endpoints. *store.Store satisfies this interface.
type DataSource interface {
	List(ctx context.Context, resource catalog.Resource, filters map[string]string, limit int, offset int) ([]map[string]any, error)
	Get(ctx context.Context, resource catalog.Resource, id string) (map[string]any, error)
}

// serverEntry tracks one running HTTP listener.
type serverEntry struct {
	server *http.Server
	port   int
}

// Manager polls proxy_settings and proxy_endpoints, reconciling running HTTP
// listeners to match the desired state. When is_enabled is true it starts a
// listener for each active endpoint; when false it stops all of them.
type Manager struct {
	data      DataSource
	resources map[string]catalog.Resource
	executor  *routing.Executor
	log       *slog.Logger

	mu       sync.Mutex
	servers  map[int]*serverEntry // port → running server

	reloadCh chan struct{} // buffered(1): signals an immediate reconcile
}

// NewManager creates a Manager. data must satisfy DataSource (*store.Store does).
// executor is the live routing pipeline used by per-endpoint handlers.
func NewManager(
	data DataSource,
	resources map[string]catalog.Resource,
	executor *routing.Executor,
	log *slog.Logger,
) *Manager {
	if log == nil {
		log = slog.Default()
	}
	return &Manager{
		data:     data,
		resources: resources,
		executor: executor,
		log:      log,
		servers:  make(map[int]*serverEntry),
		reloadCh: make(chan struct{}, 1),
	}
}

// Run starts the reconcile loop. It blocks until ctx is cancelled, then stops
// all running listeners and returns. Designed to be called as a goroutine.
func (m *Manager) Run(ctx context.Context) error {
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()

	// Reconcile once at startup.
	m.reconcile(ctx)

	for {
		select {
		case <-ctx.Done():
			m.stopAll()
			return ctx.Err()
		case <-ticker.C:
			m.reconcile(ctx)
		case <-m.reloadCh:
			m.reconcile(ctx)
		}
	}
}

// Reload signals an immediate reconcile without waiting for the next tick.
// It is non-blocking and safe to call from any goroutine.
func (m *Manager) Reload() {
	select {
	case m.reloadCh <- struct{}{}:
	default:
		// already queued; nothing to do
	}
}

// reconcile reads proxy_settings and proxy_endpoints from the DB and
// starts or stops HTTP listeners to match the desired state.
func (m *Manager) reconcile(ctx context.Context) {
	settingsRes, ok := m.resources["proxy-settings"]
	if !ok {
		return
	}

	rows, err := m.data.List(ctx, settingsRes, nil, 1, 0)
	if err != nil || len(rows) == 0 {
		if err != nil {
			m.log.Warn("proxy: failed to read proxy_settings", slog.Any("error", err))
		}
		m.stopAll()
		return
	}

	setting := rows[0]
	isEnabled, _ := setting["is_enabled"].(bool)
	bindAddress, _ := setting["bind_address"].(string)
	if bindAddress == "" {
		bindAddress = "127.0.0.1"
	}

	if !isEnabled {
		m.stopAll()
		return
	}

	endpointsRes, ok := m.resources["proxy-endpoints"]
	if !ok {
		return
	}

	epRows, err := m.data.List(ctx, endpointsRes, map[string]string{"is_active": "true"}, 500, 0)
	if err != nil {
		m.log.Warn("proxy: failed to read proxy_endpoints", slog.Any("error", err))
		m.stopAll()
		return
	}

	// Build desired map: port → endpoint row.
	desired := make(map[int]map[string]any, len(epRows))
	for _, ep := range epRows {
		port := toInt(ep["port"])
		if port > 0 {
			desired[port] = ep
		}
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	// Stop listeners for ports no longer desired.
	for port, entry := range m.servers {
		if _, ok := desired[port]; !ok {
			m.stopServer(entry)
			delete(m.servers, port)
		}
	}

	// Start listeners for new desired ports.
	for port, ep := range desired {
		if _, running := m.servers[port]; !running {
			m.startServer(bindAddress, port, ep)
		}
	}
}

// startServer attempts to bind port and starts an HTTP listener for one endpoint.
// Must be called with m.mu held.
func (m *Manager) startServer(bindAddress string, port int, ep map[string]any) {
	addr := fmt.Sprintf("%s:%d", bindAddress, port)
	endpointID := strField(ep, "id")
	dialect := strField(ep, "dialect")
	if dialect == "" {
		dialect = "openai"
	}

	ln, err := net.Listen("tcp", addr)
	if err != nil {
		// Port already bound or OS-level error — log and skip without crashing.
		m.log.Warn("proxy: cannot bind port", slog.String("addr", addr), slog.Any("error", err))
		return
	}

	handler := newEndpointHandler(dialect, endpointID, m.executor, m.log)
	srv := &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       90 * time.Second,
		WriteTimeout:      90 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	m.servers[port] = &serverEntry{server: srv, port: port}

	go func() {
		m.log.Info("proxy: listener started", slog.String("addr", addr), slog.String("dialect", dialect))
		if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
			m.log.Warn("proxy: listener error", slog.String("addr", addr), slog.Any("error", err))
		}
	}()
}

// stopServer gracefully shuts down a single listener. Must be called with m.mu held.
func (m *Manager) stopServer(entry *serverEntry) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := entry.server.Shutdown(ctx); err != nil {
		m.log.Warn("proxy: shutdown error", slog.Int("port", entry.port), slog.Any("error", err))
	}
	m.log.Info("proxy: listener stopped", slog.Int("port", entry.port))
}

// stopAll stops every running listener and clears the servers map.
func (m *Manager) stopAll() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for port, entry := range m.servers {
		m.stopServer(entry)
		delete(m.servers, port)
	}
}

// strField returns the string value of key in row, or "" if absent / not a string.
func strField(row map[string]any, key string) string {
	if v, ok := row[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

// toInt coerces a numeric DB value (float64 from JSON, int64, int, or int32)
// to int, returning 0 for unrecognised types.
func toInt(v any) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case int64:
		return int(n)
	case int32:
		return int(n)
	case int:
		return n
	}
	return 0
}
