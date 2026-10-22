// handlers/hallinta.go: hallinta-alustan (platform) HTTP-käsittelijät.
//
// Hallinta on yleiskäyttöinen palvelunhallinta-alusta (EI AutoQAD-spesifi), joka
// visualisoi minkä tahansa konttipalvelun topologian. Nämä handlerit lukevat
// platform_*-tauluja (palvelut, pinot, projektit) ja palauttavat rivit sellaisenaan
// JSONina (geneerinen writeMaps/scanMaps). Reitit ovat /hallinta/*.
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
		// container-sarake aliastetaan "image"-nimelle frontendille. CASE-lauseke
		// johtaa is_active-lipusta luettavan status-tekstin (running/stopped).
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
