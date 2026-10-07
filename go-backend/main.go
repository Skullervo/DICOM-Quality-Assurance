package main

import (
	"log"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/joho/godotenv"
	"github.com/rs/cors"

	"autoqad-backend/config"
	"autoqad-backend/handlers"
	"autoqad-backend/middleware"
)

func main() {
	// Load .env (ignore error — env vars come from container in production)
	_ = godotenv.Load()
	_ = godotenv.Load("../.env")

	db, err := config.ConnectDB()
	if err != nil {
		log.Fatalf("database connection failed: %v", err)
	}
	defer db.Close()

	// Toleranssitaulu + siemenarvot (idempotentti)
	if err := handlers.EnsureTolerances(db); err != nil {
		log.Printf("warning: tolerance seed failed: %v", err)
	}

	r := chi.NewRouter()

	// Middleware
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.RealIP)
	r.Use(cors.New(cors.Options{
		AllowedOrigins:   []string{"http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "http://localhost:5176", "http://localhost:3000"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
	}).Handler)
	r.Use(handlers.MetricsMiddleware) // Prometheus-pyyntömetriikat

	// Health check + Prometheus-metriikat (auth-ryhmän ulkopuolella)
	r.Get("/health", handlers.Health)
	r.Handle("/metrics", handlers.MetricsHandler())

	r.Route("/Laadunhallinta", func(r chi.Router) {
		r.Route("/api", func(r chi.Router) {
			r.Use(middleware.RequireAuth)

			// Ultrasound
			r.Get("/us/institutions", handlers.USInstitutions(db))
			r.Get("/us/units", handlers.USUnits(db))
			r.Get("/us/device/{station}", handlers.USDeviceDetail(db))
			r.Get("/us/api/s_depth/{station}", handlers.USData(db))
			r.Get("/us/summary", handlers.USSummary(db))
			r.Get("/us/image/{instance}", handlers.USImage(db))
			r.Get("/us/analysis-image/{instance}", handlers.USAnalysisImage(db))        // S3-proxy (event-driven)
			r.Get("/us/analysis-image-url/{instance}", handlers.USAnalysisImageURL(db)) // S3 presigned URL

			// X-ray
			r.Get("/xray/institutions", handlers.XrayInstitutions(db))
			r.Get("/xray/units", handlers.XrayUnits(db))
			r.Get("/xray/device/{inst}/{unit}", handlers.XrayDeviceDetail(db))
			r.Get("/xray/api/uniformity/{station}", handlers.XrayData(db))
			r.Get("/xray/image/{instance}", handlers.XRImage)
			r.Get("/xray/analysis-image/{instance}/{type}", handlers.XRAnalysisImage(db))

			// CT
			r.Get("/ct/institutions", handlers.CTInstitutions(db))
			r.Get("/ct/units", handlers.CTUnits(db))
			r.Get("/ct/device/{station}", handlers.CTDeviceDetail(db))
			r.Get("/ct/api/data/{station}", handlers.CTData(db))
			r.Get("/ct/image/{instance}", handlers.CTImage)
			r.Get("/ct/analysis-image/{instance}/{type}", handlers.CTAnalysisImage(db))
			r.Get("/ct/series-meta/{instance}", handlers.CTSeriesMeta)
			r.Get("/ct/series-image/{instance}", handlers.CTSeriesImage)

			// Mittaukset — kaikki Orthanc-mittaukset + analyysin tila (onnistui/epaonnistui)
			r.Get("/us/measurements", handlers.Measurements(db, "ultrasound", "instance", "Instance", []string{"US"}, ""))
			r.Get("/xray/measurements", handlers.Measurements(db, "xray_analysis", "series_id", "Series", []string{"CR", "DX"}, ""))
			r.Get("/ct/measurements", handlers.Measurements(db, "ct_analysis", "instance", "Series", []string{"CT"}, "_0"))
			r.Get("/measurement-image/{id}", handlers.MeasurementImage) // esikatselu orthanc-id:llä (US instanssi / CT-XR sarja)

			// Toleranssit (hyvaksyttavyysrajat) — GET kaikki + PUT yksi metriikka
			r.Get("/tolerances", handlers.GetTolerances(db))
			r.Put("/tolerances/{modality}/{metric}", handlers.UpdateTolerance(db))

			// Laitteen metatietojen paivitys (UPDATE kaikille laitteen mittauksille)
			r.Put("/us/device-meta/{station}", handlers.UpdateDevice(db, "ultrasound", "stationname", "institutionname", "manufacturer", "manufacturermodelname"))
			r.Put("/xray/device-meta/{station}", handlers.UpdateDevice(db, "xray_analysis", "station_name", "institution_name", "manufacturer", "manufacturer_model_name"))
			r.Put("/ct/device-meta/{station}", handlers.UpdateDevice(db, "ct_analysis", "station_name", "institution_name", "manufacturer", "manufacturer_model_name"))

			// Admin
			r.Get("/devices", handlers.ListDevices(db))
			r.Get("/institutions", handlers.ListInstitutions(db))

			// Hallinta (platform_* taulut)
			r.Get("/hallinta/services", handlers.GetServices(db))
			r.Get("/hallinta/stacks", handlers.GetStacks(db))
			r.Get("/hallinta/projects", handlers.GetProjects(db))

			// AI (mittauskontekstoitu) + Slack (modaliteettireititetty)
			r.Post("/ask-ai", handlers.AskAI(db))
			r.Post("/report-issue", handlers.ReportSlackIssue)
		})

		// Serve React SPA for all other paths
		r.Get("/*", handlers.ServeReact)
	})

	// Serve React SPA + assets at root too, so direct access (NodePort/ilman Caddya)
	// toimii: index.html (base='/') viittaa /assets/* -> nämä tarjoillaan juuresta.
	r.Get("/*", handlers.ServeReact)

	port := os.Getenv("PORT")
	if port == "" {
		port = os.Getenv("GO_PORT")
	}
	if port == "" {
		port = "8080"
	}

	log.Printf("AutoQAD Go backend starting on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}
