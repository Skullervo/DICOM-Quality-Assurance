package models

import (
	"encoding/json"
	"time"
)

// CTAnalysis maps to the "ct_analysis" table.
type CTAnalysis struct {
	ID          int       `json:"id" db:"id"`
	Instance    string    `json:"instance" db:"instance"`
	SeriesID    string    `json:"series_id" db:"series_id"`
	ProcessedAt time.Time `json:"processed_at" db:"processed_at"`

	// DICOM metadata
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

	// CT parameters
	KVP                      string   `json:"kvp" db:"kvp"`
	TubeCurrent              string   `json:"tube_current" db:"tube_current"`
	ExposureTime             string   `json:"exposure_time" db:"exposure_time"`
	ExposureMAs              string   `json:"exposure_mAs" db:"exposure_mAs"`
	SliceThickness           *float64 `json:"slice_thickness" db:"slice_thickness"`
	SliceSpacing             *float64 `json:"slice_spacing" db:"slice_spacing"`
	ReconstructionKernel     string   `json:"reconstruction_kernel" db:"reconstruction_kernel"`
	ReconstructionAlgorithm  string   `json:"reconstruction_algorithm" db:"reconstruction_algorithm"`
	CTDIVol                  *float64 `json:"ctdi_vol" db:"ctdi_vol"`
	DLP                      *float64 `json:"dlp" db:"dlp"`

	// Phantom config
	PhantomModel   string   `json:"phantom_model" db:"phantom_model"`
	PhantomRollDeg *float64 `json:"phantom_roll_deg" db:"phantom_roll_deg"`
	OriginSlice    *int     `json:"origin_slice" db:"origin_slice"`
	NumImages      *int     `json:"num_images" db:"num_images"`

	// CTP404: HU linearity
	HUAir            *float64 `json:"hu_air" db:"hu_air"`
	HUPMP            *float64 `json:"hu_pmp" db:"hu_pmp"`
	HULDPE           *float64 `json:"hu_ldpe" db:"hu_ldpe"`
	HUPoly           *float64 `json:"hu_poly" db:"hu_poly"`
	HUAcrylic        *float64 `json:"hu_acrylic" db:"hu_acrylic"`
	HUDelrin         *float64 `json:"hu_delrin" db:"hu_delrin"`
	HUTeflon         *float64 `json:"hu_teflon" db:"hu_teflon"`
	SliceThicknessMM *float64 `json:"slice_thickness_mm" db:"slice_thickness_mm"`
	CTP404Pass       *bool    `json:"ctp404_pass" db:"ctp404_pass"`

	// CTP486: Uniformity
	UniformityIndex       *float64 `json:"uniformity_index" db:"uniformity_index"`
	IntegralNonUniformity *float64 `json:"integral_non_uniformity" db:"integral_non_uniformity"`
	HUCenter              *float64 `json:"hu_center" db:"hu_center"`
	HUTop                 *float64 `json:"hu_top" db:"hu_top"`
	HURight               *float64 `json:"hu_right" db:"hu_right"`
	HUBottom              *float64 `json:"hu_bottom" db:"hu_bottom"`
	HULeft                *float64 `json:"hu_left" db:"hu_left"`
	CTP486Pass            *bool    `json:"ctp486_pass" db:"ctp486_pass"`

	// CTP528: Spatial resolution (MTF)
	MTF50Percent *float64         `json:"mtf_50_percent" db:"mtf_50_percent"`
	MTF10Percent *float64         `json:"mtf_10_percent" db:"mtf_10_percent"`
	MTFData      *json.RawMessage `json:"mtf_data" db:"mtf_data"`
	CTP528Pass   *bool            `json:"ctp528_pass" db:"ctp528_pass"`

	// CTP515: Low contrast
	NumLowContrastROIsSeen *int             `json:"num_low_contrast_rois_seen" db:"num_low_contrast_rois_seen"`
	MedianCNR              *float64         `json:"median_cnr" db:"median_cnr"`
	LowContrastDetails     *json.RawMessage `json:"low_contrast_details" db:"low_contrast_details"`
	CTP515Pass             *bool            `json:"ctp515_pass" db:"ctp515_pass"`

	// Overall
	OverallPass *bool    `json:"overall_pass" db:"overall_pass"`
	NoiseHUStd  *float64 `json:"noise_hu_std" db:"noise_hu_std"`

	// Analysis metadata
	AnalysisType    string   `json:"analysis_type" db:"analysis_type"`
	AnalysisVersion string   `json:"analysis_version" db:"analysis_version"`
	ProcessingTime  *float64 `json:"processing_time" db:"processing_time"`

	// Images
	SummaryImage           []byte `json:"-" db:"summary_image"`
	HULinearityImage       []byte `json:"-" db:"hu_linearity_image"`
	ThicknessImage         []byte `json:"-" db:"thickness_image"`
	UniformityImage        []byte `json:"-" db:"uniformity_image"`
	MTFImage               []byte `json:"-" db:"mtf_image"`
	LowContrastImage       []byte `json:"-" db:"low_contrast_image"`
	HULinearityChartImage  []byte `json:"-" db:"hu_linearity_chart_image"`
	MTFChartImage          []byte `json:"-" db:"mtf_chart_image"`
	UniformityProfileImage []byte `json:"-" db:"uniformity_profile_image"`
	SideViewImage          []byte `json:"-" db:"side_view_image"`
}
