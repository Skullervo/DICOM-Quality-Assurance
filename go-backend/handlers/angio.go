package handlers

// handlers/angio.go: angiografia-QA:n (XA, läpivalaisu) HTTP-käsittelijät.
//
// Kyselee "angio_analysis"-taulua (Leeds TOR-18 -fantomi) ja palauttaa JSONia
// frontendille. Rakenne vastaa tarkalleen xray.go:ta (instituutiot -> laitteet ->
// laitteen tiedot + trendidata), mutta kaksi eroa:
//   1. Granulariteetti on per-instanssi (kuten US), ei per-sarja.
//   2. Analyysikuva (overlay-PNG) on S3:ssa (output_image_path = s3://bucket/key),
//      ei tietokannan VARBINARY-sarakkeessa. Siksi analyysikuva proxataan S3:sta
//      storage.go:n apureilla (kuten US), ei lueta DB:stä.
//
// Alla oleva englanninkielinen kommentti kuvaa saman asian.

// Angiography/fluoroscopy (DICOM modality XA) QA data handlers. Mirrors the X-ray
// handlers (xray.go) exactly in structure, but queries the "angio_analysis" table
// with Leeds TOR-18 metrics. Granularity is PER-INSTANCE (like US). Analysis images
// are stored in S3 (output_image_path = s3://bucket/key), not DB VARBINARY, so the
// analysis-image handler proxies from S3 via storage.go helpers (as US does).

import (
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-chi/chi/v5"
)

// AngioInstitutions palauttaa angio-mittauksista löytyvät instituutiot laite- ja mittausmäärineen.
func AngioInstitutions(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := db.QueryContext(context.Background(),
			`SELECT institution_name,
			        COUNT(DISTINCT station_name) as device_count,
			        COUNT(*) as measurement_count
			 FROM angio_analysis
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

// AngioUnits palauttaa angio-laitteet ryhmiteltynä. Valinnainen ?institution= rajaa yhteen instituutioon.
func AngioUnits(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		institution := r.URL.Query().Get("institution")

		query := `SELECT station_name, institution_name, manufacturer,
		                 manufacturer_model_name, FORMAT(MAX(processed_at), 'yyyy-MM-dd') as last_measurement,
		                 COUNT(*) as measurement_count
		          FROM angio_analysis
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

// AngioDeviceDetail palauttaa yhden laitteen ({inst}/{unit}) viimeisimmät mittaukset
// (enintään 100, uusin ensin) Leeds TOR-18 -metriikoineen.
func AngioDeviceDetail(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		inst := chi.URLParam(r, "inst") // instituutio
		unit := chi.URLParam(r, "unit") // laitetunnus

		rows, err := db.QueryContext(context.Background(),
			`SELECT TOP 100 id, instance, station_name, institution_name, manufacturer,
			        manufacturer_model_name, study_date, content_date,
			        percent_integral_uniformity, median_contrast,
			        median_cnr, mtf_50_percent, num_contrast_rois_seen,
			        kvp, exposure_mas AS [exposure_mAs],
			        distance_source_to_detector, imager_pixel_spacing, processed_at
			 FROM angio_analysis
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

// AngioData palauttaa laitteen Leeds TOR-18 -metriikkojen aikasarjan trendikuvaajia
// varten. Reitti: /angio/api/uniformity/{station}.
func AngioData(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		station := chi.URLParam(r, "station")

		rows, err := db.QueryContext(context.Background(),
			`SELECT study_date, instance,
			        percent_integral_uniformity, median_contrast, median_cnr,
			        mtf_50_percent, num_contrast_rois_seen, phantom_area
			 FROM angio_analysis
			 WHERE station_name = @p1
			 ORDER BY study_date`, station)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		type dataPoint struct {
			StudyDate                 string   `json:"study_date"`
			Instance                  string   `json:"instance"`
			PercentIntegralUniformity *float64 `json:"percent_integral_uniformity"`
			MedianContrast            *float64 `json:"median_contrast"`
			MedianCNR                 *float64 `json:"median_cnr"`
			MTF50Percent              *float64 `json:"mtf_50_percent"`
			NumContrastROIsSeen       *int     `json:"num_contrast_rois_seen"`
			PhantomArea               *float64 `json:"phantom_area"`
		}
		var results []dataPoint
		for rows.Next() {
			var d dataPoint
			if err := rows.Scan(
				&d.StudyDate, &d.Instance,
				&d.PercentIntegralUniformity, &d.MedianContrast, &d.MedianCNR,
				&d.MTF50Percent, &d.NumContrastROIsSeen, &d.PhantomArea,
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

// AngioImage proxies the Orthanc preview for angiography (mirrors XRImage).
func AngioImage(w http.ResponseWriter, r *http.Request) {
	instance := chi.URLParam(r, "instance")
	_, imgB64, err := fetchOrthancPreviewRaw(instance)
	if err != nil {
		http.Error(w, "Orthanc fetch failed: "+err.Error(), http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"image": imgB64,
		"mime":  "image/jpeg",
	})
}

// angioOutputImagePath hakee angio_analysis.output_image_path -arvon instanssille.
func angioOutputImagePath(ctx context.Context, db *sql.DB, instance string) (string, bool) {
	var p *string
	err := db.QueryRowContext(ctx,
		`SELECT TOP 1 output_image_path FROM angio_analysis WHERE instance = @p1 AND output_image_path IS NOT NULL`,
		instance).Scan(&p)
	if err != nil || p == nil || *p == "" {
		return "", false
	}
	return *p, true
}

// AngioAnalysisImage proxaa analyysikuvan (overlay PNG) S3:sta — kuten US
// (output_image_path = s3://bucket/key). GET /angio/analysis-image/{instance}
func AngioAnalysisImage(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		instance := chi.URLParam(r, "instance")
		path, ok := angioOutputImagePath(r.Context(), db, instance)
		if !ok {
			http.NotFound(w, r)
			return
		}
		bucket, key, ok := parseS3Path(path)
		if !ok {
			http.Error(w, "invalid s3 path", http.StatusInternalServerError)
			return
		}
		cl, err := getS3Client()
		if err != nil {
			http.Error(w, "s3 init: "+err.Error(), http.StatusInternalServerError)
			return
		}
		out, err := cl.GetObject(r.Context(), &s3.GetObjectInput{Bucket: &bucket, Key: &key})
		if err != nil {
			http.Error(w, "s3 get: "+err.Error(), http.StatusBadGateway)
			return
		}
		defer out.Body.Close()
		ct := "image/png"
		if out.ContentType != nil && *out.ContentType != "" {
			ct = *out.ContentType
		}
		w.Header().Set("Content-Type", ct)
		w.Header().Set("Cache-Control", "no-cache")
		io.Copy(w, out.Body) //nolint:errcheck
	}
}
