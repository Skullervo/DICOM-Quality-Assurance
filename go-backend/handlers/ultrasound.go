package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
)

// USInstitutions returns distinct institution names from the ultrasound table.
func USInstitutions(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
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

// USUnits returns distinct devices/stations grouped by institution.
func USUnits(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		institution := r.URL.Query().Get("institution")

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

// USDeviceDetail returns info and recent measurements for a US device.
func USDeviceDetail(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		station := chi.URLParam(r, "station")

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

// USData returns QA metric time series for charts.
func USData(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		station := chi.URLParam(r, "station")

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

// Device name mapping: station name -> (manufacturer, model)
var deviceNameMap = map[string][2]string{
	"LOGIQE9US2":    {"GE Healthcare", "LOGIQ E9"},
	"LS7-209507SU3": {"GE Healthcare", "LOGIQ S7"},
	"LS7226747SU4":  {"GE Healthcare", "LOGIQ S7"},
	"LS81806167S4":  {"GE Healthcare", "LOGIQ S8"},
	"AVOUS12":       {"Samsung", "RS85 Prestige"},
	"SAMAVO1":       {"Samsung", "RS85 Prestige"},
}

// USSummary returns a full summary table of all US measurements with QA metrics.
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
		// Add official device names
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
