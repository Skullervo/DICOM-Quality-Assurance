package models

import (
	"time"
)

// AngioAnalysis maps to the "angio_analysis" table (Angiography/fluoroscopy, DICOM
// modality XA). Mirrors XrayAnalysis but with Leeds TOR-18 metrics and S3 image
// storage (output_image_path holds an s3://bucket/key) instead of DB VARBINARY.
// One row per XA instance (per-instance granularity, like US).
type AngioAnalysis struct {
	ID          int       `json:"id" db:"id"`
	Instance    string    `json:"instance" db:"instance"`
	SeriesID    string    `json:"series_id" db:"series_id"`
	ProcessedAt time.Time `json:"processed_at" db:"processed_at"`

	// DICOM metadata (snake_case)
	InstitutionName       string `json:"institution_name" db:"institution_name"`
	InstitutionalDeptName string `json:"institutional_department_name" db:"institutional_department_name"`
	Manufacturer          string `json:"manufacturer" db:"manufacturer"`
	ManufacturerModelName string `json:"manufacturer_model_name" db:"manufacturer_model_name"`
	Modality              string `json:"modality" db:"modality"`
	StationName           string `json:"station_name" db:"station_name"`
	DeviceSerialNumber    string `json:"device_serial_number" db:"device_serial_number"`
	StudyDate             string `json:"study_date" db:"study_date"`
	SeriesDate            string `json:"series_date" db:"series_date"`
	ContentDate           string `json:"content_date" db:"content_date"`
	ContentTime           string `json:"content_time" db:"content_time"`

	// XA acquisition parameters
	KVP                      *float64 `json:"kvp" db:"kvp"`
	ExposureMAs              *float64 `json:"exposure_mas" db:"exposure_mas"`
	DistSourceToDetector     *float64 `json:"distance_source_to_detector" db:"distance_source_to_detector"`
	ImagerPixelSpacing       *float64 `json:"imager_pixel_spacing" db:"imager_pixel_spacing"`

	// Leeds TOR-18 results (low-contrast + uniformity reliable; MTF best-effort)
	NumContrastROIsSeen       *int     `json:"num_contrast_rois_seen" db:"num_contrast_rois_seen"`
	MedianCNR                 *float64 `json:"median_cnr" db:"median_cnr"`
	MedianContrast            *float64 `json:"median_contrast" db:"median_contrast"`
	PercentIntegralUniformity *float64 `json:"percent_integral_uniformity" db:"percent_integral_uniformity"`
	MTF50Percent              *float64 `json:"mtf_50_percent" db:"mtf_50_percent"` // best-effort; no tolerance

	// Phantom geometry
	PhantomArea    *float64 `json:"phantom_area" db:"phantom_area"`
	PhantomCenterX *float64 `json:"phantom_center_x" db:"phantom_center_x"`
	PhantomCenterY *float64 `json:"phantom_center_y" db:"phantom_center_y"`

	// Output + bookkeeping
	OutputImagePath string   `json:"output_image_path" db:"output_image_path"` // s3://bucket/key (overlay PNG)
	AnalysisType    string   `json:"analysis_type" db:"analysis_type"`
	AnalysisVersion string   `json:"analysis_version" db:"analysis_version"`
	ProcessingTime  *float64 `json:"processing_time" db:"processing_time"`
}
