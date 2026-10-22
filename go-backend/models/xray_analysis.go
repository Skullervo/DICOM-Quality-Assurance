// models/xray_analysis.go: röntgenmittauksen (NORMI-13) tietuerakenne.
//
// Vastaa tietokannan "xray_analysis"-taulua. Yksi rivi = yksi analysoitu röntgenkuva
// (modaliteetit CR/DX). Sisältää DICOM-metatiedot, kuvausparametrit sekä NORMI-13-
// fantomin QA-metriikat: tasaisuus (uniformity), Cu-kiila (cu_000...cu_230),
// matalakontrasti (lc_*) ja MTF. Kuten muissakin malleissa, handlerit lukevat rivit
// enimmäkseen scanMaps-funktiolla; tämä struct toimii skeeman dokumentaationa.
// Sarakenimet ovat snake_casea (toisin kuin US:ssä). Osoitintyypit sallivat NULLin.
package models

import (
	"encoding/json"
	"time"
)

// XrayAnalysis maps to the "xray_analysis" table.
type XrayAnalysis struct {
	ID          int       `json:"id" db:"id"`                     // pääavain
	Instance    string    `json:"instance" db:"instance"`         // Orthanc-instanssitunnus
	SeriesID    string    `json:"series_id" db:"series_id"`       // sarjatunnus (XR:n DB-avain mittaukset-näkymässä)
	ProcessedAt time.Time `json:"processed_at" db:"processed_at"` // analyysin ajankohta

	// DICOM-metatiedot (snake_case)
	ContentDate               string `json:"content_date" db:"content_date"`
	ContentTime               string `json:"content_time" db:"content_time"`
	DeviceSerialNumber        string `json:"device_serial_number" db:"device_serial_number"`
	InstanceNumber            string `json:"instance_number" db:"instance_number"`
	InstitutionName           string `json:"institution_name" db:"institution_name"`
	InstitutionalDeptName     string `json:"institutional_department_name" db:"institutional_department_name"`
	Manufacturer              string `json:"manufacturer" db:"manufacturer"`
	ManufacturerModelName     string `json:"manufacturer_model_name" db:"manufacturer_model_name"`
	Modality                  string `json:"modality" db:"modality"`
	PatientID                 string `json:"patient_id" db:"patient_id"`
	PatientName               string `json:"patient_name" db:"patient_name"`
	StationName               string `json:"station_name" db:"station_name"`
	SeriesDate                string `json:"series_date" db:"series_date"`
	StudyDate                 string `json:"study_date" db:"study_date"`

	// Röntgenin kuvausparametrit (säilytetty merkkijonoina kuten DICOMissa)
	KVP                      string `json:"kvp" db:"kvp"`
	ExposureTime             string `json:"exposure_time" db:"exposure_time"`
	TubeCurrent              string `json:"tube_current" db:"tube_current"`
	FilterType               string `json:"filter_type" db:"filter_type"`
	GridInfo                 string `json:"grid_info" db:"grid_info"`
	DistSourceToDetector     string `json:"distance_source_to_detector" db:"distance_source_to_detector"`
	FocalSpot                string `json:"focal_spot" db:"focal_spot"`
	ProtocolName             string `json:"protocol_name" db:"protocol_name"`
	ExposureMAs              string `json:"exposure_mAs" db:"exposure_mAs"`

	// NORMI-13-tulokset: tasaisuus (PIU)
	UniformityCenter    *float64 `json:"uniformity_center" db:"uniformity_center"`     // keskipisteen arvo
	UniformityDeviation *float64 `json:"uniformity_deviation" db:"uniformity_deviation"` // poikkeama (%) — tasaisuusmittari
	BgMean              *float64 `json:"bg_mean" db:"bg_mean"`                         // taustan keskiarvo

	// Cu-kiilan mittaukset: 7 kuparipaksuutta (0.0...2.3 mm), kullekin keskiarvo + keskihajonta
	Cu000Mean *float64 `json:"cu_000_mean" db:"cu_000_mean"`
	Cu030Mean *float64 `json:"cu_030_mean" db:"cu_030_mean"`
	Cu065Mean *float64 `json:"cu_065_mean" db:"cu_065_mean"`
	Cu100Mean *float64 `json:"cu_100_mean" db:"cu_100_mean"`
	Cu140Mean *float64 `json:"cu_140_mean" db:"cu_140_mean"`
	Cu185Mean *float64 `json:"cu_185_mean" db:"cu_185_mean"`
	Cu230Mean *float64 `json:"cu_230_mean" db:"cu_230_mean"`
	Cu000Std  *float64 `json:"cu_000_std" db:"cu_000_std"`
	Cu030Std  *float64 `json:"cu_030_std" db:"cu_030_std"`
	Cu065Std  *float64 `json:"cu_065_std" db:"cu_065_std"`
	Cu100Std  *float64 `json:"cu_100_std" db:"cu_100_std"`
	Cu140Std  *float64 `json:"cu_140_std" db:"cu_140_std"`
	Cu185Std  *float64 `json:"cu_185_std" db:"cu_185_std"`
	Cu230Std  *float64 `json:"cu_230_std" db:"cu_230_std"`

	// Matalakontrastikohteet: kontrastiarvo 6 eri kohteelle (0.8...5.6)
	LC08Contrast        *float64         `json:"lc_08_contrast" db:"lc_08_contrast"`
	LC12Contrast        *float64         `json:"lc_12_contrast" db:"lc_12_contrast"`
	LC20Contrast        *float64         `json:"lc_20_contrast" db:"lc_20_contrast"`
	LC28Contrast        *float64         `json:"lc_28_contrast" db:"lc_28_contrast"`
	LC40Contrast        *float64         `json:"lc_40_contrast" db:"lc_40_contrast"`
	LC56Contrast        *float64         `json:"lc_56_contrast" db:"lc_56_contrast"`
	LowContrastDetails  *json.RawMessage `json:"low_contrast_details" db:"low_contrast_details"`

	// Yhteenvetometriikat
	MedianContrast      *float64         `json:"median_contrast" db:"median_contrast"`           // kontrastin mediaani
	MedianCNR           *float64         `json:"median_cnr" db:"median_cnr"`                     // kontrasti-kohina-suhteen mediaani
	MTF50Percent        *float64         `json:"mtf_50_percent" db:"mtf_50_percent"`             // erotuskyky (MTF 50 %)
	NumContrastROIsSeen *int             `json:"num_contrast_rois_seen" db:"num_contrast_rois_seen"` // montako kontrastikohdetta havaittiin

	// Fantomin geometria (sijainti/koko kuvassa — segmentoinnin tulos)
	PhantomAngle   *float64 `json:"phantom_angle" db:"phantom_angle"`
	PhantomCenterX *float64 `json:"phantom_center_x" db:"phantom_center_x"`
	PhantomCenterY *float64 `json:"phantom_center_y" db:"phantom_center_y"`
	PhantomArea    *float64 `json:"phantom_area" db:"phantom_area"`
	SideLength     *float64 `json:"side_length" db:"side_length"`

	// MTF-käyrän raakadata (JSON)
	MTFData *json.RawMessage `json:"mtf_data" db:"mtf_data"`

	// Analyysin kirjanpito
	AnalysisType    string   `json:"analysis_type" db:"analysis_type"`
	AnalysisVersion string   `json:"analysis_version" db:"analysis_version"`
	ProcessingTime  *float64 `json:"processing_time" db:"processing_time"`

	// Analyysikuvat tallennettu tietokantaan binäärinä (VARBINARY). `json:"-"` = ei
	// mukaan JSON-vastaukseen; kuvat haetaan erikseen /xray/analysis-image-reitiltä.
	ContrastROIsImage []byte `json:"-" db:"contrast_rois_image"` // ROI-kartta
	MTFLpImage        []byte `json:"-" db:"mtf_lp_image"`        // viivaparikuva
	MTFCurveImage     []byte `json:"-" db:"mtf_curve_image"`     // MTF-käyrä
}
