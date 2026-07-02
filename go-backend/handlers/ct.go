package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
)

func CTInstitutions(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := db.QueryContext(context.Background(),
			`SELECT institution_name,
			        COUNT(DISTINCT station_name) as device_count,
			        COUNT(*) as measurement_count
			 FROM ct_analysis
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

// CTUnits returns distinct CT devices grouped by institution.
func CTUnits(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		institution := r.URL.Query().Get("institution")

		query := `SELECT station_name, institution_name, manufacturer,
		                 manufacturer_model_name, FORMAT(MAX(processed_at), 'yyyy-MM-dd') as last_measurement,
		                 COUNT(*) as measurement_count
		          FROM ct_analysis
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

func CTDeviceDetail(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		station := chi.URLParam(r, "station")

		rows, err := db.QueryContext(context.Background(),
			`SELECT TOP 100 id, instance, station_name, institution_name, manufacturer,
			        manufacturer_model_name, study_date, content_date,
			        phantom_model, kvp, [exposure_mAs], slice_thickness,
			        hu_air, hu_pmp, hu_ldpe, hu_poly, hu_acrylic, hu_delrin, hu_teflon,
			        uniformity_index, mtf_50_percent, overall_pass,
			        hu_roi_map, processed_at
			 FROM ct_analysis
			 WHERE station_name = @p1
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

func CTData(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		station := chi.URLParam(r, "station")

		rows, err := db.QueryContext(context.Background(),
			`SELECT study_date,
			        hu_air, hu_pmp, hu_ldpe, hu_poly, hu_acrylic, hu_delrin, hu_teflon,
			        uniformity_index, integral_non_uniformity,
			        hu_center, hu_top, hu_right, hu_bottom, hu_left,
			        mtf_50_percent, mtf_10_percent,
			        num_low_contrast_rois_seen,
			        noise_hu_std, slice_thickness_mm,
			        overall_pass, phantom_model
			 FROM ct_analysis
			 WHERE station_name = @p1
			 ORDER BY study_date`, station)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		type dataPoint struct {
			StudyDate              string   `json:"study_date"`
			HUAir                  *float64 `json:"hu_air"`
			HUPMP                  *float64 `json:"hu_pmp"`
			HULDPE                 *float64 `json:"hu_ldpe"`
			HUPoly                 *float64 `json:"hu_poly"`
			HUAcrylic              *float64 `json:"hu_acrylic"`
			HUDelrin               *float64 `json:"hu_delrin"`
			HUTeflon               *float64 `json:"hu_teflon"`
			UniformityIndex        *float64 `json:"uniformity_index"`
			IntegralNonUniformity  *float64 `json:"integral_non_uniformity"`
			HUCenter               *float64 `json:"hu_center"`
			HUTop                  *float64 `json:"hu_top"`
			HURight                *float64 `json:"hu_right"`
			HUBottom               *float64 `json:"hu_bottom"`
			HULeft                 *float64 `json:"hu_left"`
			MTF50Percent           *float64 `json:"mtf_50_percent"`
			MTF10Percent           *float64 `json:"mtf_10_percent"`
			NumLowContrastROIsSeen *int     `json:"num_low_contrast_rois_seen"`
			NoiseHUStd             *float64 `json:"noise_hu_std"`
			SliceThicknessMM       *float64 `json:"slice_thickness_mm"`
			OverallPass            *bool    `json:"overall_pass"`
			PhantomModel           string   `json:"phantom_model"`
		}
		var results []dataPoint
		for rows.Next() {
			var d dataPoint
			if err := rows.Scan(
				&d.StudyDate,
				&d.HUAir, &d.HUPMP, &d.HULDPE, &d.HUPoly, &d.HUAcrylic, &d.HUDelrin, &d.HUTeflon,
				&d.UniformityIndex, &d.IntegralNonUniformity,
				&d.HUCenter, &d.HUTop, &d.HURight, &d.HUBottom, &d.HULeft,
				&d.MTF50Percent, &d.MTF10Percent,
				&d.NumLowContrastROIsSeen,
				&d.NoiseHUStd, &d.SliceThicknessMM,
				&d.OverallPass, &d.PhantomModel,
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
