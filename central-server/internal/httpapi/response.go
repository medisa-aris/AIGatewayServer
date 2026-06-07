package httpapi

import (
	"encoding/json"
	"net/http"
	"time"
)

// defaultTimeout bounds database work for a single API request.
const defaultTimeout = 10 * time.Second

// errorResponse is the JSON shape used for API errors.
type errorResponse struct {
	Error string `json:"error"`
}

// writeJSON serializes a response body as JSON.
func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// writeError serializes an error response as JSON.
func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, errorResponse{Error: message})
}
