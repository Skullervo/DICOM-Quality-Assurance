package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
)

func XrayInstitutions(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := db.QueryContext(context.Background(),
			`SELECT institution_name,
			        COUNT(DISTINCT station_name) as device_count,
			        COUNT(*) as measurement_count
			 FROM xray_analysis
			 WHERE institution_name != ''
			 GROUP BY institution_name
			 ORDER BY institution_name`)
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

// XrayUnits returns distinct devices grouped by institution.
func XrayUnits(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		institution := r.URL.Query().Get("institution")

		query := `SELECT station_name, institution_name, manufacturer,
		                 manufacturer_model_name, FORMAT(MAX(processed_at), 'yyyy-MM-dd') as last_measurement,
		                 COUNT(*) as measurement_count
		          FROM xray_analysis
		          WHERE station_name != ''`
		args := []interface{}{}
		if institution != "" {
			query += ` AND institution_name = @p1`
			args = append(args, institution)
		}
		query += ` GROUP BY station_name, institution_name, manufacturer, manufacturer_model_name
		           ORDER BY institution_name, station_name`

		rows, err := db.QueryContext(context.Background(), query, args...)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		type unit struct {
			StationName       string `json:"station_name"`
			InstitutionName   string `json:"institution_name"`
			Manufacturer      string `json:"manufacturer"`
			ManufacturerModel string `json:"manufacturer_model"`
			LastMeasurement   string `json:"last_measurement"`
			MeasurementCount  int    `json:"measurement_count"`
		}
		var results []unit
		for rows.Next() {
			var u unit
			if err := rows.Scan(&u.StationName, &u.InstitutionName, &u.Manufacturer,
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

func XrayDeviceDetail(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		inst := chi.URLParam(r, "inst")
		unit := chi.URLParam(r, "unit")

		rows, err := db.QueryContext(context.Background(),
			`SELECT TOP 100 id, instance, station_name, institution_name, manufacturer,
			        manufacturer_model_name, study_date, content_date,
			        uniformity_center, uniformity_deviation, median_contrast,
			        median_cnr, mtf_50_percent, num_contrast_rois_seen, cu_100_mean,
			        kvp, exposure_mas AS [exposure_mAs], processed_at
			 FROM xray_analysis
			 WHERE institution_name = @p1 AND station_name = @p2
			 ORDER BY processed_at DESC`, inst, unit)
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

func XrayData(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		station := chi.URLParam(r, "station")

		rows, err := db.QueryContext(context.Background(),
			`SELECT study_date, instance,
			        uniformity_center, uniformity_deviation, bg_mean,
			        cu_000_mean, cu_030_mean, cu_065_mean, cu_100_mean,
			        cu_140_mean, cu_185_mean, cu_230_mean,
			        lc_08_contrast, lc_12_contrast, lc_20_contrast,
			        lc_28_contrast, lc_40_contrast, lc_56_contrast,
			        median_contrast, median_cnr, mtf_50_percent,
			        num_contrast_rois_seen
			 FROM xray_analysis
			 WHERE station_name = @p1
			 ORDER BY study_date`, station)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		type dataPoint struct {
			StudyDate           string   `json:"study_date"`
			Instance            string   `json:"instance"`
			UniformityCenter    *float64 `json:"uniformity_center"`
			UniformityDeviation *float64 `json:"uniformity_deviation"`
			BgMean              *float64 `json:"bg_mean"`
			Cu000Mean           *float64 `json:"cu_000_mean"`
			Cu030Mean           *float64 `json:"cu_030_mean"`
			Cu065Mean           *float64 `json:"cu_065_mean"`
			Cu100Mean           *float64 `json:"cu_100_mean"`
			Cu140Mean           *float64 `json:"cu_140_mean"`
			Cu185Mean           *float64 `json:"cu_185_mean"`
			Cu230Mean           *float64 `json:"cu_230_mean"`
			LC08Contrast        *float64 `json:"lc_08_contrast"`
			LC12Contrast        *float64 `json:"lc_12_contrast"`
			LC20Contrast        *float64 `json:"lc_20_contrast"`
			LC28Contrast        *float64 `json:"lc_28_contrast"`
			LC40Contrast        *float64 `json:"lc_40_contrast"`
			LC56Contrast        *float64 `json:"lc_56_contrast"`
			MedianContrast      *float64 `json:"median_contrast"`
			MedianCNR           *float64 `json:"median_cnr"`
			MTF50Percent        *float64 `json:"mtf_50_percent"`
			NumContrastROIsSeen *int     `json:"num_contrast_rois_seen"`
		}
		var results []dataPoint
		for rows.Next() {
			var d dataPoint
			if err := rows.Scan(
				&d.StudyDate, &d.Instance,
				&d.UniformityCenter, &d.UniformityDeviation, &d.BgMean,
				&d.Cu000Mean, &d.Cu030Mean, &d.Cu065Mean, &d.Cu100Mean,
				&d.Cu140Mean, &d.Cu185Mean, &d.Cu230Mean,
				&d.LC08Contrast, &d.LC12Contrast, &d.LC20Contrast,
				&d.LC28Contrast, &d.LC40Contrast, &d.LC56Contrast,
				&d.MedianContrast, &d.MedianCNR, &d.MTF50Percent,
				&d.NumContrastROIsSeen,
			); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			results = append(results, d)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(results)
	}
}
