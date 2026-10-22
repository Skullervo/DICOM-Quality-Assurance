// handlers/image.go: kuvien haku ja tarjoilu (Orthanc-PACS + DB-BLOBit).
//
// Tämä tiedosto vastaa kaikesta kuvanäytöstä paitsi S3-pohjaisista (ks. storage.go):
//   - Näyttökuvat (preview/rendered) haetaan Orthancista proxaamalla.
//   - XR/CT-analyysikuvat haetaan tietokannan binäärisarakkeista (VARBINARY).
//   - CT-kuvankatselin: DB:n instance-kenttä on muotoa "{series}_0"; puretaan
//     siitä sarja-id, haetaan sarjan viipaleet ja renderöidään aito Window/Level
//     Orthancin /rendered-endpointilla.
// Kaikki Orthanc-kutsut käyttävät ympäristömuuttujista luettua perus-URLia ja
// mahdollista HTTP Basic -autentikointia.
package handlers

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

// Jaettu HTTP-asiakas Orthanc-kutsuille, 15 s aikakatkaisulla (ettei roikota pyyntöä ikuisesti).
var orthancClient = &http.Client{Timeout: 15 * time.Second}

// orthancBaseURL palauttaa Orthancin osoitteen ympäristöstä (oletus konttiverkon http://orthanc:8042).
func orthancBaseURL() string {
	u := os.Getenv("ORTHANC_URL")
	if u == "" {
		u = "http://orthanc:8042"
	}
	return u
}

// fetchOrthancPreviewRaw hakee instanssin esikatselukuvan Orthancista ja palauttaa
// sekä raakatavut että base64-koodatun merkkijonon. Käyttää /frames/0/preview-polkua
// (siistimpi tulos ilman DICOM-overlayta jos saatavilla).
func fetchOrthancPreviewRaw(instanceID string) ([]byte, string, error) {
	url := fmt.Sprintf("%s/instances/%s/frames/0/preview", orthancBaseURL(), instanceID)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, "", err
	}
	// Orthanc vaatii usein HTTP Basic -autentikoinnin; lisätään jos käyttäjä on asetettu.
	user := os.Getenv("ORTHANC_USERNAME")
	pass := os.Getenv("ORTHANC_PASSWORD")
	if user != "" {
		req.SetBasicAuth(user, pass)
	}
	resp, err := orthancClient.Do(req)
	if err != nil {
		log.Printf("[orthanc] request error: %v", err)
		return nil, "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("orthanc returned %d", resp.StatusCode)
	}
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, "", err
	}
	return data, base64.StdEncoding.EncodeToString(data), nil
}

// imageServiceURL palauttaa Python-kuvapalvelun osoitteen (oletus http://image-service:8090).
func imageServiceURL() string {
	u := os.Getenv("IMAGE_SERVICE_URL")
	if u == "" {
		u = "http://image-service:8090"
	}
	return u
}

// fetchCroppedUSImage pyytää Python-kuvapalvelulta rajatun (cropattu) US-kuvan.
// Jos kuvapalvelu ei vastaa tai palauttaa virheen, palataan Orthancin esikatseluun.
func fetchCroppedUSImage(instance string) (string, string, error) {
	url := fmt.Sprintf("%s/us/image/%s", imageServiceURL(), instance)
	resp, err := orthancClient.Get(url)
	if err != nil {
		log.Printf("[image-service] unavailable, falling back to Orthanc preview: %v", err)
		_, b64, err2 := fetchOrthancPreviewRaw(instance)
		return b64, "image/jpeg", err2
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		log.Printf("[image-service] returned %d, falling back to Orthanc preview", resp.StatusCode)
		_, b64, err2 := fetchOrthancPreviewRaw(instance)
		return b64, "image/jpeg", err2
	}
	var result struct {
		Image string `json:"image"`
		Mime  string `json:"mime"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", "", err
	}
	return result.Image, result.Mime, nil
}

// USImage palauttaa US-näyttökuvan sekä profiilit (vaaka/pysty) ja syvyyden.
// Konveksit anturit: kuvasta on esirenderöity "suoristettu" versio (DERIVED Secondary
// Capture) ja tallennettu Orthanciin -> tarjoillaan se. Lineaariset/puuttuvat: haetaan
// rajattu kuva Python-kuvapalvelusta (tai viime kädessä raaka Orthanc-esikatselu).
func USImage(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		instance := chi.URLParam(r, "instance")

		// Haetaan profiilit, syvyys ja mahdollinen suoristetun kuvan instanssi-id.
		// Virhe sivuutetaan tarkoituksella (_ =): jos riviä ei ole, jatketaan ilman dataa.
		var horizStr, vertStr *string
		var sDepth *float64
		var straightened *string
		_ = db.QueryRowContext(context.Background(),
			`SELECT TOP 1 horiz_prof, vert_prof, s_depth, straightened_instance
			 FROM ultrasound WHERE instance = @p1`,
			instance).Scan(&horizStr, &vertStr, &sDepth, &straightened)

		var imgB64, mime string
		var imgErr error
		if straightened != nil && *straightened != "" {
			// Suoristettu konveksikuva on jo Orthancissa SC-instanssina -> tarjoillaan se.
			_, imgB64, imgErr = fetchOrthancPreviewRaw(*straightened)
			mime = "image/jpeg"
		} else {
			imgB64, mime, imgErr = fetchCroppedUSImage(instance)
		}

		// horiz_prof/vert_prof tallennettu NVARCHAR(MAX) JSON-merkkijonona -> parsitaan takaisin
		var horizProf any = []interface{}{}
		var vertProf any = []interface{}{}
		if horizStr != nil {
			horizProf = reparseJSON(*horizStr)
		}
		if vertStr != nil {
			vertProf = reparseJSON(*vertStr)
		}

		result := map[string]interface{}{
			"horiz_prof": horizProf,
			"vert_prof":  vertProf,
			"s_depth":    sDepth,
		}
		if imgErr == nil {
			result["image"] = imgB64
			result["mime"] = mime
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	}
}

// XRImage proxaa röntgenin näyttökuvan (Orthanc-esikatselu) base64-JSONina.
func XRImage(w http.ResponseWriter, r *http.Request) {
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

// XRAnalysisImage palauttaa tietokantaan tallennetun analyysikuvan (VARBINARY)
// xray_analysis-taulusta. Reitin {type}-parametri valitsee kuvan, ja validFields
// kääntää sen oikeaksi sarakenimeksi. Tämä sallittujen arvojen kartta on TÄRKEÄ
// turvan vuoksi: koska sarakenimi upotetaan SQL-kyselyyn, vain kartassa olevat
// (ei käyttäjän vapaa teksti) kelpaavat -> ei SQL-injektiota.
func XRAnalysisImage(db *sql.DB) http.HandlerFunc {
	validFields := map[string]string{
		"contrast_rois": "contrast_rois_image",
		"mtf_lp":        "mtf_lp_image",
		"mtf_curve":     "mtf_curve_image",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		instance := chi.URLParam(r, "instance")
		imgType := chi.URLParam(r, "type")
		field, ok := validFields[imgType]
		if !ok {
			http.Error(w, "unknown image type", http.StatusBadRequest)
			return
		}
		var data []byte
		err := db.QueryRowContext(context.Background(),
			fmt.Sprintf(`SELECT TOP 1 %s FROM xray_analysis WHERE instance = @p1`, field),
			instance).Scan(&data)
		if err != nil || len(data) == 0 {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "image/png")
		w.Write(data) //nolint:errcheck
	}
}

// ===== CT-kuvankatselin: series -> viipale -> palvelinpuolen Window/Level =====
// DB:n instance-kenttä on muotoa "{orthanc_series_id}_0". Puretaan series-id ja
// haetaan viipaleet, jotta voidaan renderöidä aito W/L Orthancin /rendered:llä.

// seriesIDFromDBInstance purkaa sarja-id:n DB:n instance-kentästä ("{series}_0" -> "{series}").
// Jos alaviivaa ei ole, palautetaan syöte sellaisenaan.
func seriesIDFromDBInstance(s string) string {
	if i := strings.LastIndex(s, "_"); i > 0 {
		return s[:i]
	}
	return s
}

// atoiSafe muuntaa merkkijonon kokonaisluvuksi; virhetilanteessa palauttaa 0 (ei paniikkia).
func atoiSafe(s string) int { n, _ := strconv.Atoi(strings.TrimSpace(s)); return n }

// firstNum: DICOM voi antaa moniarvoisen ikkunan ("-600\\50") -> ota ensimmäinen.
func firstNum(s string) string {
	s = strings.TrimSpace(s)
	for _, sep := range []string{"\\", " ", ","} {
		if i := strings.Index(s, sep); i >= 0 {
			s = s[:i]
		}
	}
	return strings.TrimSpace(s)
}

// orthancAuthGet tekee GET-pyynnön Orthancin annettuun polkuun Basic-autentikoinnilla.
func orthancAuthGet(path string) (*http.Response, error) {
	req, err := http.NewRequest("GET", orthancBaseURL()+path, nil)
	if err != nil {
		return nil, err
	}
	if u := os.Getenv("ORTHANC_USERNAME"); u != "" {
		req.SetBasicAuth(u, os.Getenv("ORTHANC_PASSWORD"))
	}
	return orthancClient.Do(req)
}

// seriesOrderedInstances palauttaa sarjan instanssi-id:t InstanceNumber-järjestyksessä.
func seriesOrderedInstances(seriesID string) ([]string, error) {
	resp, err := orthancAuthGet("/series/" + seriesID + "/instances")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("orthanc series %d", resp.StatusCode)
	}
	var arr []struct {
		ID            string `json:"ID"`
		MainDicomTags struct {
			InstanceNumber string `json:"InstanceNumber"`
		} `json:"MainDicomTags"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&arr); err != nil {
		return nil, err
	}
	// Järjestetään viipaleet InstanceNumberin mukaan, jotta katselin näyttää ne oikeassa
	// anatomisessa järjestyksessä (Orthanc ei takaa järjestystä).
	sort.SliceStable(arr, func(i, j int) bool {
		return atoiSafe(arr[i].MainDicomTags.InstanceNumber) < atoiSafe(arr[j].MainDicomTags.InstanceNumber)
	})
	ids := make([]string, len(arr))
	for i := range arr {
		ids[i] = arr[i].ID
	}
	return ids, nil
}

// CTSeriesMeta: GET /ct/series-meta/{instance} -> viipalemäärä + oletusikkuna (WC/WW).
func CTSeriesMeta(w http.ResponseWriter, r *http.Request) {
	sid := seriesIDFromDBInstance(chi.URLParam(r, "instance"))
	ids, err := seriesOrderedInstances(sid)
	if err != nil || len(ids) == 0 {
		http.NotFound(w, r)
		return
	}
	mid := len(ids) / 2
	wc, ww := "", ""
	if resp, err := orthancAuthGet("/instances/" + ids[mid] + "/simplified-tags"); err == nil {
		defer resp.Body.Close()
		var tags map[string]interface{}
		if json.NewDecoder(resp.Body).Decode(&tags) == nil {
			if v, ok := tags["WindowCenter"]; ok {
				wc = firstNum(fmt.Sprint(v))
			}
			if v, ok := tags["WindowWidth"]; ok {
				ww = firstNum(fmt.Sprint(v))
			}
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
		"sliceCount":   len(ids),
		"defaultSlice": mid,
		"windowCenter": wc,
		"windowWidth":  ww,
	})
}

// CTSeriesImage: GET /ct/series-image/{instance}?slice=N&wc=&ww=
// Proxaa Orthancin palvelinpuolen renderöinnin halutulla ikkunalla (aito W/L).
func CTSeriesImage(w http.ResponseWriter, r *http.Request) {
	sid := seriesIDFromDBInstance(chi.URLParam(r, "instance"))
	ids, err := seriesOrderedInstances(sid)
	if err != nil || len(ids) == 0 {
		http.NotFound(w, r)
		return
	}
	q := r.URL.Query()
	idx := len(ids) / 2
	if s := q.Get("slice"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n >= 0 && n < len(ids) {
			idx = n
		}
	}
	path := "/instances/" + ids[idx] + "/rendered"
	if wc, ww := q.Get("wc"), q.Get("ww"); wc != "" && ww != "" {
		path += "?window-center=" + url.QueryEscape(wc) + "&window-width=" + url.QueryEscape(ww) + "&quality=90"
	}
	resp, err := orthancAuthGet(path)
	if err != nil {
		http.Error(w, "orthanc: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		http.Error(w, "orthanc rendered "+strconv.Itoa(resp.StatusCode), http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", resp.Header.Get("Content-Type"))
	w.Header().Set("Cache-Control", "no-cache")
	io.Copy(w, resp.Body) //nolint:errcheck
}

// CTImage proxaa CT:n näyttökuvan (Orthanc-esikatselu) base64-JSONina.
func CTImage(w http.ResponseWriter, r *http.Request) {
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

// CTAnalysisImage palauttaa DB:hen tallennetun analyysikuvan (VARBINARY) ct_analysis-
// taulusta. Kuten XRAnalysisImage: {type} valitaan vain sallittujen sarakkeiden
// kartasta (validFields) -> turvallinen sarakenimen upotus kyselyyn.
func CTAnalysisImage(db *sql.DB) http.HandlerFunc {
	validFields := map[string]string{
		"hu_linearity":       "hu_linearity_image",
		"hu_linearity_clean": "hu_linearity_clean_image",
		"thickness":          "thickness_image",
		"uniformity":         "uniformity_image",
		"mtf":                "mtf_image",
		"low_contrast":       "low_contrast_image",
		"hu_linearity_chart": "hu_linearity_chart_image",
		"mtf_chart":          "mtf_chart_image",
		"uniformity_profile": "uniformity_profile_image",
		"side_view":          "side_view_image",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		instance := chi.URLParam(r, "instance")
		imgType := chi.URLParam(r, "type")
		field, ok := validFields[imgType]
		if !ok {
			http.Error(w, "unknown image type", http.StatusBadRequest)
			return
		}
		var data []byte
		err := db.QueryRowContext(context.Background(),
			fmt.Sprintf(`SELECT TOP 1 %s FROM ct_analysis WHERE instance = @p1`, field),
			instance).Scan(&data)
		if err != nil || len(data) == 0 {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "image/png")
		w.Write(data) //nolint:errcheck
	}
}
