package handlers

import (
	"net/http"
	"os"
	"path/filepath"
)

// ServeReact serves the React SPA. All non-API routes under /Laadunhallinta/* land here.
// In development the frontend is served by Vite (port 5174).
// In production the React build dist/ is embedded next to the binary.
func ServeReact(w http.ResponseWriter, r *http.Request) {
	distDir := os.Getenv("REACT_DIST")
	if distDir == "" {
		distDir = "./frontend/dist"
	}

	// Try to serve the requested file directly
	requestedPath := filepath.Join(distDir, filepath.Clean(r.URL.Path))
	if info, err := os.Stat(requestedPath); err == nil && !info.IsDir() {
		http.ServeFile(w, r, requestedPath)
		return
	}

	// Fall back to index.html for client-side routing
	http.ServeFile(w, r, filepath.Join(distDir, "index.html"))
}
