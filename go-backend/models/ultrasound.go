package models

import (
	"encoding/json"
	"time"
)

// Ultrasound maps to the "ultrasound" table.
// Uses legacy column names (no underscores) for DICOM metadata fields.
type Ultrasound struct {
	ID          int       `json:"id" db:"id"`
	Instance    string    `json:"instance" db:"instance"`
	SeriesID    string    `json:"series_id" db:"series_id"`
	ProcessedAt time.Time `json:"processed_at" db:"processed_at"`

	// DICOM metadata (legacy column names)
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

	// QA results
	SDepth   *float64         `json:"s_depth" db:"s_depth"`
	UCov     *float64         `json:"u_cov" db:"u_cov"`
	USkew    *float64         `json:"u_skew" db:"u_skew"`
	ULow     *json.RawMessage `json:"u_low" db:"u_low"`
	HorizProf *json.RawMessage `json:"horiz_prof" db:"horiz_prof"`
	VertProf  *json.RawMessage `json:"vert_prof" db:"vert_prof"`
}
