// models/ultrasound.go: ultraäänimittauksen tietuerakenne.
//
// Vastaa tietokannan "ultrasound"-taulua. Yksi rivi = yksi analysoitu US-instanssi.
// HUOM: tämä struct kuvaa taulun kaikki kentät, mutta useat US-handlerit (ultrasound.go,
// image.go) lukevat rivit geneerisellä scanMaps-funktiolla map[string]any -muotoon
// sen sijaan että täyttäisivät tämän structin. Struct on silti hyödyllinen
// dokumentaationa siitä, mitä sarakkeita taulussa on ja minkä tyyppisiä ne ovat.
//
// `json:"..."`-tagit määräävät JSON-kentän nimen frontendille, `db:"..."` kertoo
// tietokantasarakkeen nimen. US käyttää VANHOJA sarakenimiä ilman alaviivoja
// (esim. stationname, contentdate) yhteensopivuuden vuoksi — niitä EI harmonisoida.
package models

import (
	"encoding/json"
	"time"
)

// Ultrasound maps to the "ultrasound" table.
// Uses legacy column names (no underscores) for DICOM metadata fields.
type Ultrasound struct {
	ID          int       `json:"id" db:"id"`                   // taulun pääavain
	Instance    string    `json:"instance" db:"instance"`       // Orthanc-instanssitunnus (DB-avain)
	SeriesID    string    `json:"series_id" db:"series_id"`     // DICOM-sarjan tunnus
	ProcessedAt time.Time `json:"processed_at" db:"processed_at"` // milloin analyysi tehtiin

	// DICOM-metatiedot (vanhat sarakenimet ilman alaviivoja)
	ContentDate               string `json:"contentdate" db:"contentdate"`
	ContentTime               string `json:"contenttime" db:"contenttime"`
	DeviceSerialNumber        string `json:"deviceserialnumber" db:"deviceserialnumber"`
	InstanceNumber            string `json:"instancenumber" db:"instancenumber"`
	InstitutionName           string `json:"institutionname" db:"institutionname"`
	InstitutionalDeptName     string `json:"institutionaldepartmentname" db:"institutionaldepartmentname"`
	Manufacturer              string `json:"manufacturer" db:"manufacturer"`
	ManufacturerModelName     string `json:"manufacturermodelname" db:"manufacturermodelname"`
	Modality                  string `json:"modality" db:"modality"`
	PatientID                 string `json:"patientid" db:"patientid"`
	PatientName               string `json:"patientname" db:"patientname"`
	StationName               string `json:"stationname" db:"stationname"`
	SeriesDate                string `json:"seriesdate" db:"seriesdate"`
	StudyDate                 string `json:"studydate" db:"studydate"`
	TransducerType            string `json:"tranducertype" db:"tranducertype"`

	// QA-tulokset (van Horssen 2017 -pohjainen ilmakaiku-analyysi).
	// Osoitin-tyypit (*float64) sallivat NULL-arvon, jos metriikkaa ei saatu laskettua.
	SDepth    *float64         `json:"s_depth" db:"s_depth"`       // havaittu syvyys (reverberaatio)
	UCov      *float64         `json:"u_cov" db:"u_cov"`           // tasaisuuden variaatiokerroin
	USkew     *float64         `json:"u_skew" db:"u_skew"`         // vinous
	ULow      *json.RawMessage `json:"u_low" db:"u_low"`           // matalan signaalin alueet (JSON-array)
	HorizProf *json.RawMessage `json:"horiz_prof" db:"horiz_prof"` // vaakaprofiili (JSON-array kuvaajaa varten)
	VertProf  *json.RawMessage `json:"vert_prof" db:"vert_prof"`   // pystyprofiili (JSON-array)
}
