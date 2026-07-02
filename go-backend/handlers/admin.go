package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
)

func ListDevices(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := db.QueryContext(context.Background(),
			`SELECT d.id, d.station_name, d.serial_number, d.manufacturer,
			        d.model_name, d.department, d.modality_type, d.is_active,
			        i.name as institution_name
			 FROM devices d
			 JOIN institutions i ON d.institution_id = i.id
			 ORDER BY i.name, d.station_name`)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

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
}

func ListInstitutions(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := db.QueryContext(context.Background(),
			`SELECT id, name, region, address, contact_info, is_active
			 FROM institutions
			 ORDER BY name`)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

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
}
