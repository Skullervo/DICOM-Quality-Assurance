package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
)

// GetServices palauttaa hallinnan palvelut (platform_services).
func GetServices(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := db.QueryContext(context.Background(),
			`SELECT id, name, description, container AS image, host, host_port,
			        category, layer, url, is_active,
			        CASE WHEN is_active = 1 THEN 'running' ELSE 'stopped' END AS status,
			        project_id
			 FROM platform_services
			 ORDER BY name`)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		writeMaps(w, rows)
	}
}

// GetStacks palauttaa palvelupinot (platform_service_stacks).
func GetStacks(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := db.QueryContext(context.Background(),
			`SELECT id, name, description, network_name, is_builtin
			 FROM platform_service_stacks
			 ORDER BY name`)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		writeMaps(w, rows)
	}
}

// GetProjects palauttaa projektit (platform_projects).
func GetProjects(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := db.QueryContext(context.Background(),
			`SELECT id, name, description, is_default, svg_width, svg_height
			 FROM platform_projects
			 ORDER BY name`)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		writeMaps(w, rows)
	}
}

// writeMaps kirjoittaa rivit JSONina (käyttää scanMaps-apufunktiota).
func writeMaps(w http.ResponseWriter, rows *sql.Rows) {
	results, err := scanMaps(rows)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if results == nil {
		results = []map[string]any{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}
