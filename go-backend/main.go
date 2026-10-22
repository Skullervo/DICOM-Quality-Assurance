// main.go: AutoQAD Go-backendin käynnistyspiste.
//
// Tämä tiedosto on koko palvelun runko. Se tekee neljä asiaa:
//  1. Lataa ympäristömuuttujat (.env) ja avaa tietokantayhteyden (MS SQL Server).
//  2. Varmistaa että toleranssitaulu (hyväksyttävyysrajat) on olemassa ja siemennetty.
//  3. Rakentaa HTTP-reitityksen (chi-reititin): kaikki /Laadunhallinta/api/* -rajapinnat
//     sekä React-käyttöliittymän (SPA) tarjoilu.
//  4. Käynnistää HTTP-palvelimen kuuntelemaan porttia (oletus 8080).
//
// Backend toimii gRPC-mikropalveluiden "edessä": se EI itse analysoi kuvia vaan lukee
// Python-palveluiden tietokantaan kirjaamat QA-tulokset ja tarjoilee ne JSONina
// frontendille. Lisäksi se välittää kuvia Orthancista ja S3:sta sekä juttelee OpenAI:n
// ja Slackin kanssa.
package main

import (
	"log"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"               // kevyt HTTP-reititin
	chimw "github.com/go-chi/chi/v5/middleware" // chin valmiit middlewaret (loki, recover, RealIP)
	"github.com/joho/godotenv"               // .env-tiedoston lataus
	"github.com/rs/cors"                     // CORS-otsakkeet (selain sallii frontendin kutsut)

	"autoqad-backend/config"     // tietokantayhteys
	"autoqad-backend/handlers"   // HTTP-käsittelijät (yksi tiedosto per resurssi)
	"autoqad-backend/middleware" // oma auth-middleware
)

// main on ohjelman käynnistyspiste. Kaikki alustus tapahtuu tässä funktiossa.
func main() {
	// Ladataan .env-tiedosto. Virhe sivuutetaan tarkoituksella: tuotannossa
	// ympäristömuuttujat tulevat suoraan kontista, jolloin .env-tiedostoa ei ole.
	_ = godotenv.Load()
	_ = godotenv.Load("../.env")

	// Avataan tietokantayhteys (config/database.go). Jos yhteys ei aukea, palvelua
	// ei kannata käynnistää lainkaan -> log.Fatalf sammuttaa prosessin.
	db, err := config.ConnectDB()
	if err != nil {
		log.Fatalf("database connection failed: %v", err)
	}
	defer db.Close() // suljetaan yhteys siististi kun main päättyy

	// Toleranssitaulu + siemenarvot (idempotentti): luo tolerance_config-taulun jos
	// puuttuu ja täyttää oletusrajat config.ts:n mukaan. Ajetaan joka käynnistyksessä;
	// jos epäonnistuu, vain varoitetaan eikä kaadeta palvelua (rajat voi lisätä myöhemmin).
	if err := handlers.EnsureTolerances(db); err != nil {
		log.Printf("warning: tolerance seed failed: %v", err)
	}

	// Luodaan reititin, johon alla kiinnitetään middlewaret ja reitit.
	r := chi.NewRouter()

	// Middleware = jokaisen pyynnön läpi ajettava väliohjelmisto (järjestyksellä on väliä).
	r.Use(chimw.Logger)    // kirjaa jokaisen pyynnön lokiin
	r.Use(chimw.Recoverer) // ottaa kiinni paniikin (panic) -> palauttaa 500 ettei palvelu kaadu
	r.Use(chimw.RealIP)    // lukee todellisen client-IP:n proxyn (Caddy/F5) otsakkeista
	// CORS: sallii React-kehityspalvelimen (Vite, portit 5173-5176 / 3000) tehdä
	// rajapintakutsuja selaimesta. Tuotannossa frontend tarjoillaan samasta
	// origin-osoitteesta kuin backend, joten CORS koskee lähinnä paikallista kehitystä.
	r.Use(cors.New(cors.Options{
		AllowedOrigins:   []string{"http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "http://localhost:5176", "http://localhost:3000"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
	}).Handler)
	r.Use(handlers.MetricsMiddleware) // kerää Prometheus-pyyntömetriikat (määrä + kesto)

	// Health check + Prometheus-metriikat tarjoillaan ILMAN autentikointia, jotta
	// Kubernetes (liveness/readiness) ja Prometheus pääsevät niihin käsiksi.
	r.Get("/health", handlers.Health)             // GET /health -> {"status":"ok"}
	r.Handle("/metrics", handlers.MetricsHandler()) // GET /metrics -> Prometheus-tekstimuoto

	// Kaikki varsinainen sovellus elää /Laadunhallinta-polun alla (Caddy-proxy ohjaa
	// tämän polun tänne; nimi on suomea ja säilytetään tarkoituksella).
	r.Route("/Laadunhallinta", func(r chi.Router) {
		// /api-alipolku: JSON-rajapinnat frontendille. Tämän ryhmän sisällä vaaditaan
		// autentikointi (RequireAuth) — ks. middleware/auth.go.
		r.Route("/api", func(r chi.Router) {
			r.Use(middleware.RequireAuth)

			// --- Ultraääni (US) ---
			// Kyselee ultrasound-taulua. Reitit: instituutiot -> laitteet -> laitteen
			// tarkat mittaukset/trendit + näyttökuvat (Orthanc) ja analyysikuvat (S3).
			r.Get("/us/institutions", handlers.USInstitutions(db))
			r.Get("/us/units", handlers.USUnits(db))
			r.Get("/us/device/{station}", handlers.USDeviceDetail(db))
			r.Get("/us/api/s_depth/{station}", handlers.USData(db))
			r.Get("/us/summary", handlers.USSummary(db))
			r.Get("/us/image/{instance}", handlers.USImage(db))
			r.Get("/us/analysis-image/{instance}", handlers.USAnalysisImage(db))        // backend proxaa kuvan S3:sta (event-driven)
			r.Get("/us/analysis-image-url/{instance}", handlers.USAnalysisImageURL(db)) // tai palautetaan S3:n presigned URL

			// --- Röntgen (XR; DICOM-modaliteetit CR/DX) ---
			// Kyselee xray_analysis-taulua (NORMI-13-fantomin metriikat).
			r.Get("/xray/institutions", handlers.XrayInstitutions(db))
			r.Get("/xray/units", handlers.XrayUnits(db))
			r.Get("/xray/device/{inst}/{unit}", handlers.XrayDeviceDetail(db))
			r.Get("/xray/api/uniformity/{station}", handlers.XrayData(db))
			r.Get("/xray/image/{instance}", handlers.XRImage)
			r.Get("/xray/analysis-image/{instance}/{type}", handlers.XRAnalysisImage(db)) // analyysikuva DB:n BLOBista; {type} valitsee sarakkeen

			// --- Angiografia (XA; läpivalaisu) ---
			// Kyselee angio_analysis-taulua (Leeds TOR-18 -fantomi). Analyysikuvat S3:ssa (kuten US).
			r.Get("/angio/institutions", handlers.AngioInstitutions(db))
			r.Get("/angio/units", handlers.AngioUnits(db))
			r.Get("/angio/device/{inst}/{unit}", handlers.AngioDeviceDetail(db))
			r.Get("/angio/api/uniformity/{station}", handlers.AngioData(db))
			r.Get("/angio/image/{instance}", handlers.AngioImage)
			r.Get("/angio/analysis-image/{instance}", handlers.AngioAnalysisImage(db)) // overlay-PNG proxataan S3:sta

			// --- Tietokonetomografia (CT) ---
			// Kyselee ct_analysis-taulua (Catphan-fantomi). Sisältää lisäksi palvelinpuolen
			// kuvankatselimen (series-meta + series-image), joka renderöi aidon Window/Level-ikkunan.
			r.Get("/ct/institutions", handlers.CTInstitutions(db))
			r.Get("/ct/units", handlers.CTUnits(db))
			r.Get("/ct/device/{station}", handlers.CTDeviceDetail(db))
			r.Get("/ct/api/data/{station}", handlers.CTData(db))
			r.Get("/ct/image/{instance}", handlers.CTImage)
			r.Get("/ct/analysis-image/{instance}/{type}", handlers.CTAnalysisImage(db))
			r.Get("/ct/series-meta/{instance}", handlers.CTSeriesMeta)   // sarjan viipalemäärä + oletusikkuna
			r.Get("/ct/series-image/{instance}", handlers.CTSeriesImage) // yksi viipale renderöitynä halutulla W/L-ikkunalla

			// --- Mittaukset-näkymä ---
			// Listaa modaliteetin KAIKKI Orthanc-mittaukset ja ristiinviittaa analyysitauluun:
			// löytyykö rivi (analyzed) vai epäonnistuiko analyysi (failed). Epäonnistuneet eivät
			// jää analyysitauluun, siksi lähde on Orthanc. Parametrit (ks. measurements.go):
			// taulu, instanssisarake, Orthanc-taso, modaliteettikoodit, orthanc-id -> db-avaimen suffix.
			r.Get("/us/measurements", handlers.Measurements(db, "ultrasound", "instance", "Instance", []string{"US"}, ""))
			r.Get("/xray/measurements", handlers.Measurements(db, "xray_analysis", "series_id", "Series", []string{"CR", "DX"}, ""))
			r.Get("/ct/measurements", handlers.Measurements(db, "ct_analysis", "instance", "Series", []string{"CT"}, "_0"))
			r.Get("/angio/measurements", handlers.Measurements(db, "angio_analysis", "instance", "Instance", []string{"XA"}, ""))
			r.Get("/measurement-image/{id}", handlers.MeasurementImage) // esikatselu orthanc-id:llä (US instanssi / CT-XR sarja)

			// --- Toleranssit (hyväksyttävyysrajat) ---
			// GET palauttaa kaikki rajat, PUT päivittää yhden metriikan rajat (/rajat-sivu).
			r.Get("/tolerances", handlers.GetTolerances(db))
			r.Put("/tolerances/{modality}/{metric}", handlers.UpdateTolerance(db))

			// --- Laitteen metatietojen päivitys ---
			// Korjaa laitetunnuksen/instituution/valmistajan/mallin KAIKILLE laitteen riveille
			// kyseisessä analyysitaulussa. Sarakenimet annetaan tässä (per modaliteetti), koska
			// US käyttää vanhoja nimiä ilman alaviivoja ja muut snake_casea.
			r.Put("/us/device-meta/{station}", handlers.UpdateDevice(db, "ultrasound", "stationname", "institutionname", "manufacturer", "manufacturermodelname"))
			r.Put("/xray/device-meta/{station}", handlers.UpdateDevice(db, "xray_analysis", "station_name", "institution_name", "manufacturer", "manufacturer_model_name"))
			r.Put("/ct/device-meta/{station}", handlers.UpdateDevice(db, "ct_analysis", "station_name", "institution_name", "manufacturer", "manufacturer_model_name"))
			r.Put("/angio/device-meta/{station}", handlers.UpdateDevice(db, "angio_analysis", "station_name", "institution_name", "manufacturer", "manufacturer_model_name"))

			// --- Admin: laite- ja instituutiorekisterit (devices/institutions-taulut) ---
			r.Get("/devices", handlers.ListDevices(db))
			r.Get("/institutions", handlers.ListInstitutions(db))

			// --- Hallinta: yleiskäyttöinen palvelunhallinta-alusta (platform_*-taulut) ---
			// Ei AutoQAD-spesifiä; listaa alustan palvelut, pinot ja projektit topologianäkymää varten.
			r.Get("/hallinta/services", handlers.GetServices(db))
			r.Get("/hallinta/stacks", handlers.GetStacks(db))
			r.Get("/hallinta/projects", handlers.GetProjects(db))

			// --- AI + Slack ---
			// ask-ai: lähettää kysymyksen OpenAI:lle, voi liittää laitteen mittauskontekstin.
			// report-issue: lähettää Slack-ilmoituksen modaliteettikohtaiseen kanavaan.
			r.Post("/ask-ai", handlers.AskAI(db))
			r.Post("/report-issue", handlers.ReportSlackIssue)
		})

		// Kaikki muut /Laadunhallinta/*-polut tarjoavat React-sovelluksen (SPA).
		// Selainpuolen reititys hoitaa varsinaisen sivun; palvelin palauttaa index.html:n.
		r.Get("/*", handlers.ServeReact)
	})

	// Tarjoillaan React + sen assetit myös juuresta, jotta suora pääsy (esim. NodePort
	// ilman Caddya) toimii: index.html käyttää base='/' ja viittaa /assets/*-polkuihin,
	// jotka tällöin löytyvät juuresta.
	r.Get("/*", handlers.ServeReact)

	// Portti: ensin PORT, sitten GO_PORT, muuten oletus 8080.
	port := os.Getenv("PORT")
	if port == "" {
		port = os.Getenv("GO_PORT")
	}
	if port == "" {
		port = "8080"
	}

	// Käynnistetään HTTP-palvelin. ListenAndServe palaa vain virheen sattuessa,
	// jolloin log.Fatal kirjaa virheen ja sammuttaa prosessin.
	log.Printf("AutoQAD Go backend starting on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}
