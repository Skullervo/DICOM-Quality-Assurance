// handlers/ultrasound.go: ultraääni-QA:n (US) HTTP-käsittelijät.
//
// Kyselee "ultrasound"-taulua ja palauttaa JSONia frontendille. Näkymähierarkia:
// instituutiot -> laitteet (units) -> laitteen tarkat mittaukset + trendikuvaajien data.
// HUOM: US-taulu käyttää vanhoja sarakenimiä ilman alaviivoja (stationname, contentdate).
// Kukin handler on "tehdasfunktio": se saa DB-yhteyden ja palauttaa varsinaisen
// http.HandlerFunc-sulkeuman (näin DB saadaan mukaan ilman globaalia muuttujaa).
package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
)

// USInstitutions palauttaa US-mittauksista löytyvät instituutiot sekä kunkin
// laitemäärän ja mittausmäärän (yhteenveto instituutiotason näkymään).
func USInstitutions(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Ryhmitellään instituutioittain: lasketaan uniikit laitteet ja mittausten määrä.
		rows, err := db.QueryContext(context.Background(),
			`SELECT institutionname,
			        COUNT(DISTINCT stationname) as device_count,
			        COUNT(*) as measurement_count
			 FROM ultrasound
			 WHERE institutionname != ''
			 GROUP BY institutionname
			 ORDER BY institutionname`)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		type row struct {
			Name             string `json:"name"`
			DeviceCount      int    `json:"device_count"`
			MeasurementCount int    `json:"measurement_count"`
		}
		var results []row
		for rows.Next() {
			var r row
			if err := rows.Scan(&r.Name, &r.DeviceCount, &r.MeasurementCount); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			results = append(results, r)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(results)
	}
}

// USUnits palauttaa laitteet (stationit) ryhmiteltynä. Valinnainen ?institution=
// -kyselyparametri rajaa yhteen instituutioon. Jokaisesta laitteesta näytetään
// viimeisin mittauspäivä ja mittausten määrä.
func USUnits(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		institution := r.URL.Query().Get("institution")

		// Rakennetaan kysely vaiheittain, jotta instituutiorajaus voidaan lisätä vain
		// tarvittaessa. Arvo annetaan parametrina (@p1) -> ei SQL-injektioriskiä.
		query := `SELECT stationname, institutionname, manufacturer,
		                 manufacturermodelname, FORMAT(MAX(processed_at), 'yyyy-MM-dd') as last_measurement,
		                 COUNT(*) as measurement_count
		          FROM ultrasound
		          WHERE stationname != ''`
		args := []interface{}{}
		if institution != "" {
			query += ` AND institutionname = @p1`
			args = append(args, institution)
		}
		query += ` GROUP BY stationname, institutionname, manufacturer, manufacturermodelname
		           ORDER BY institutionname, stationname`

		dbRows, err := db.QueryContext(context.Background(), query, args...)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer dbRows.Close()

		type unit struct {
			StationName       string `json:"station_name"`
			InstitutionName   string `json:"institution_name"`
			Manufacturer      string `json:"manufacturer"`
			ManufacturerModel string `json:"manufacturer_model"`
			LastMeasurement   string `json:"last_measurement"`
			MeasurementCount  int    `json:"measurement_count"`
		}
		var results []unit
		for dbRows.Next() {
			var u unit
			if err := dbRows.Scan(&u.StationName, &u.InstitutionName, &u.Manufacturer,
				&u.ManufacturerModel, &u.LastMeasurement, &u.MeasurementCount); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			results = append(results, u)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(results)
	}
}

// USDeviceDetail palauttaa yhden laitteen (station URL-parametrista) viimeisimmät
// mittaukset (enintään 100, uusin ensin) kaikkine QA-arvoineen laitesivua varten.
func USDeviceDetail(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		station := chi.URLParam(r, "station") // laitetunnus reitiltä /us/device/{station}

		// TOP 100 = MS SQL:n tapa rajata rivimäärä (vastaa LIMIT 100). u_low ym. ovat
		// JSON-sarakkeita; scanMaps + jsonColumns parsivat ne takaisin rakenteeksi.
		rows, err := db.QueryContext(context.Background(),
			`SELECT TOP 100 id, instance, stationname, institutionname, manufacturer,
			        manufacturermodelname, tranducertype, studydate, contentdate,
			        s_depth, u_cov, u_skew, u_low, deviceserialnumber,
			        straightened_instance, processed_at
			 FROM ultrasound
			 WHERE stationname = @p1
			 ORDER BY processed_at DESC`, station)
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

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(results)
	}
}

// USData palauttaa laitteen QA-metriikkojen aikasarjan (järjestetty tutkimuspäivän
// mukaan) trendikuvaajia varten. Reitti: /us/api/s_depth/{station}.
func USData(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		station := chi.URLParam(r, "station")

		// Haetaan vain kuvaajiin tarvittavat sarakkeet, aikajärjestyksessä.
		rows, err := db.QueryContext(context.Background(),
			`SELECT studydate, s_depth, u_cov, u_skew, tranducertype, instance
			 FROM ultrasound
			 WHERE stationname = @p1
			 ORDER BY studydate`, station)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		type dataPoint struct {
			StudyDate      string   `json:"study_date"`
			SDepth         *float64 `json:"s_depth"`
			UCov           *float64 `json:"u_cov"`
			USkew          *float64 `json:"u_skew"`
			TransducerType string   `json:"transducer_type"`
			Instance       string   `json:"instance"`
		}
		var results []dataPoint
		for rows.Next() {
			var d dataPoint
			if err := rows.Scan(&d.StudyDate, &d.SDepth, &d.UCov, &d.USkew, &d.TransducerType, &d.Instance); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			results = append(results, d)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(results)
	}
}

// deviceNameMap: laitetunnus -> [valmistaja, malli]. DICOMin laitetunnukset ovat
// kryptisiä (esim. "LS7226747SU4"), joten tässä ne käännetään yhteenvetonäkymässä
// luettavaan virallisen laitteen nimeen.
var deviceNameMap = map[string][2]string{
	"LOGIQE9US2":    {"GE Healthcare", "LOGIQ E9"},
	"LS7-209507SU3": {"GE Healthcare", "LOGIQ S7"},
	"LS7226747SU4":  {"GE Healthcare", "LOGIQ S7"},
	"LS81806167S4":  {"GE Healthcare", "LOGIQ S8"},
	"AVOUS12":       {"Samsung", "RS85 Prestige"},
	"SAMAVO1":       {"Samsung", "RS85 Prestige"},
}

// USSummary palauttaa koko yhteenvetotaulukon KAIKISTA US-mittauksista QA-arvoineen
// (US-taulukkonäkymä). Lisää jokaiseen riviin virallisen laitteen nimen deviceNameMapista.
func USSummary(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := db.QueryContext(context.Background(),
			`SELECT stationname, institutionname, institutionaldepartmentname, manufacturer,
			        tranducertype, seriesdate, instance,
			        s_depth, u_cov, u_skew, u_low
			 FROM ultrasound
			 ORDER BY stationname, seriesdate`)
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
		// Rikastetaan rivit virallisilla laitenimillä (jos tunnus löytyy kartasta).
		for _, row := range results {
			if station, ok := row["stationname"].(string); ok {
				if names, exists := deviceNameMap[station]; exists {
					row["device_manufacturer"] = names[0]
					row["device_model"] = names[1]
				}
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(results)
	}
}
