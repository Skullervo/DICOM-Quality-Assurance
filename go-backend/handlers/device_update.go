// device_update.go — laitteen metatietojen muokkaus.
//
// Mihin: käyttäjä voi laitesivulta korjata laitteen tunnistetiedot (nimi,
// instituutio, valmistaja, malli). Koska sama fyysinen laite esiintyy monella
// mittausrivillä, muutos kohdistetaan KAIKKIIN ko. aseman riveihin analyysitaulussa.
// Tätä käytetään kaikilla modaliteeteilla (us/xray/ct/angio) — taulun ja sarakkeiden
// nimet annetaan parametreina reitityksessä (main.go).
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
		// Vanha asematunnus URL-polusta (/.../device-meta/{station}) — tämä kertoo
		// mitkä rivit päivitetään (WHERE-ehto).
		oldStation := chi.URLParam(r, "station")

		// Pyynnön runko (JSON) sisältää uudet arvot.
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
		// Asemanimi on pakollinen (se on avainkenttä); poista reunavälit.
		req.StationName = strings.TrimSpace(req.StationName)
		if req.StationName == "" {
			http.Error(w, "station_name required", http.StatusBadRequest)
			return
		}

		// Rakennetaan UPDATE-lause. HUOM: table/sarakenimet tulevat koodista (main.go),
		// EIVÄT käyttäjältä -> fmt.Sprintf on turvallinen. Arvot sidotaan @pN-parametreina.
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
		// Montako riviä päivittyi (kaikki ko. aseman mittaukset).
		n, _ := res.RowsAffected()

		// Palauta JSON: päivitettyjen rivien määrä + uusi asemanimi.
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
			"updated":      n,
			"station_name": req.StationName,
		})
	}
}
