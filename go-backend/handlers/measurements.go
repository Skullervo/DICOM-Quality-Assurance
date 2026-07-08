package handlers

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"os"
)

// Mittaukset: listaa modaliteetin KAIKKI Orthanc-mittaukset ja merkitsee onko
// niille tehty analyysi (rivi analyysitaulussa) vai epäonnistui/kesken (ei riviä).
// Epäonnistuneet analyysit eivät jää DB:hen (vain logataan), joten "kaikki
// mittaukset" tulee Orthancista ja tila ristiinviitataan analyysitauluun.

type orthancFindResult struct {
	ID            string            `json:"ID"`
	RequestedTags map[string]string `json:"RequestedTags"`
}

func orthancFind(level, modality string) ([]orthancFindResult, error) {
	body, _ := json.Marshal(map[string]interface{}{
		"Level":         level,
		"Query":         map[string]string{"Modality": modality},
		"Expand":        true,
		"RequestedTags": []string{"StationName", "InstitutionName", "StudyDate", "Manufacturer", "ManufacturerModelName", "Modality"},
	})
	req, err := http.NewRequest("POST", orthancBaseURL()+"/tools/find", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if u := os.Getenv("ORTHANC_USERNAME"); u != "" {
		req.SetBasicAuth(u, os.Getenv("ORTHANC_PASSWORD"))
	}
	resp, err := orthancClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var out []orthancFindResult
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	return out, nil
}

type measurement struct {
	Instance          string `json:"instance"` // DB-avain ({series}_0 CT/XR, orthanc-id US)
	OrthancID         string `json:"orthanc_id"`
	StationName       string `json:"station_name"`
	InstitutionName   string `json:"institution_name"`
	StudyDate         string `json:"study_date"`
	Manufacturer      string `json:"manufacturer"`
	ManufacturerModel string `json:"manufacturer_model"`
	Modality          string `json:"modality"`
	Status            string `json:"status"` // "analyzed" | "failed"
}

// Measurements — cfg: analyysitaulu, instanssisarake, Orthanc-taso (Series/Instance),
// modaliteettikoodit, ja suffix jolla Orthanc-ID muunnetaan DB-instanssiksi (CT/XR "_0", US "").
func Measurements(db *sql.DB, table, instCol, level string, modalities []string, suffix string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Analysoitujen DB-instanssit joukkona
		analyzed := map[string]bool{}
		rows, err := db.QueryContext(context.Background(), "SELECT "+instCol+" FROM "+table)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		for rows.Next() {
			var s sql.NullString
			if err := rows.Scan(&s); err == nil && s.Valid {
				analyzed[s.String] = true
			}
		}
		rows.Close()

		out := []measurement{}
		for _, mod := range modalities {
			res, err := orthancFind(level, mod)
			if err != nil {
				http.Error(w, "orthanc: "+err.Error(), http.StatusBadGateway)
				return
			}
			for _, s := range res {
				dbKey := s.ID + suffix
				t := s.RequestedTags
				status := "failed"
				if analyzed[dbKey] {
					status = "analyzed"
				}
				out = append(out, measurement{
					Instance:          dbKey,
					OrthancID:         s.ID,
					StationName:       t["StationName"],
					InstitutionName:   t["InstitutionName"],
					StudyDate:         t["StudyDate"],
					Manufacturer:      t["Manufacturer"],
					ManufacturerModel: t["ManufacturerModelName"],
					Modality:          t["Modality"],
					Status:            status,
				})
			}
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(out) //nolint:errcheck
	}
}
