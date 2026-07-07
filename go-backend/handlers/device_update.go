package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
)

// UpdateDevice paivittaa laitteen metatiedot (laitetunnus, instituutio,
// valmistaja, malli) KAIKILLE ko. laitteen mittausriveille ao. analyysitaulussa.
// Taulun ja sarakkeiden nimet tulevat koodista (ei kayttajasyotteesta) -> ei
// SQL-injektiota; arvot parametrisoidaan. Vain UPDATE (ei poistoa/lisaysta).
func UpdateDevice(db *sql.DB, table, colStation, colInst, colMfr, colModel string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		oldStation := chi.URLParam(r, "station")

		var req struct {
			StationName       string `json:"station_name"`
			InstitutionName   string `json:"institution_name"`
			Manufacturer      string `json:"manufacturer"`
			ManufacturerModel string `json:"manufacturer_model"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid body", http.StatusBadRequest)
			return
		}
		req.StationName = strings.TrimSpace(req.StationName)
		if req.StationName == "" {
			http.Error(w, "station_name required", http.StatusBadRequest)
			return
		}

		query := fmt.Sprintf(
			"UPDATE %s SET %s=@p1, %s=@p2, %s=@p3, %s=@p4 WHERE %s=@p5",
			table, colStation, colInst, colMfr, colModel, colStation,
		)
		res, err := db.ExecContext(context.Background(), query,
			req.StationName, strings.TrimSpace(req.InstitutionName),
			strings.TrimSpace(req.Manufacturer), strings.TrimSpace(req.ManufacturerModel),
			oldStation)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		n, _ := res.RowsAffected()

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
			"updated":      n,
			"station_name": req.StationName,
		})
	}
}
