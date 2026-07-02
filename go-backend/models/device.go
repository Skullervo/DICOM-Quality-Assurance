package models

import "time"

// Transducer maps to the "transducers" table.
type Transducer struct {
	RowIndex       int     `json:"row_index" db:"row_index"`
	ModelName      string  `json:"model_name" db:"model_name"`
	Manufacturer   string  `json:"manufacturer" db:"manufacturer"`
	RCX0           int     `json:"rcx0" db:"rcx0"`
	RCY0           int     `json:"rcy0" db:"rcy0"`
	RCX1           int     `json:"rcx1" db:"rcx1"`
	RCY1           int     `json:"rcy1" db:"rcy1"`
	PhysUnitsX     int     `json:"phys_units_x" db:"phys_units_x"`
	PhysUnitsY     int     `json:"phys_units_y" db:"phys_units_y"`
	PhysDeltaX     float64 `json:"phys_delta_x" db:"phys_delta_x"`
	PhysDeltaY     float64 `json:"phys_delta_y" db:"phys_delta_y"`
	TransducerName string  `json:"transducer_name" db:"transducer_name"`
}

// Institution maps to the "institutions" table.
type Institution struct {
	ID          int    `json:"id" db:"id"`
	Name        string `json:"name" db:"name"`
	Region      string `json:"region" db:"region"`
	Address     string `json:"address" db:"address"`
	ContactInfo string `json:"contact_info" db:"contact_info"`
	IsActive    bool   `json:"is_active" db:"is_active"`
}

// Device maps to the "devices" table.
type Device struct {
	ID               int        `json:"id" db:"id"`
	StationName      string     `json:"station_name" db:"station_name"`
	SerialNumber     string     `json:"serial_number" db:"serial_number"`
	Manufacturer     string     `json:"manufacturer" db:"manufacturer"`
	ModelName        string     `json:"model_name" db:"model_name"`
	InstitutionID    int        `json:"institution_id" db:"institution_id"`
	Department       string     `json:"department" db:"department"`
	ModalityType     string     `json:"modality_type" db:"modality_type"`
	CommissionedDate *time.Time `json:"commissioned_date" db:"commissioned_date"`
	IsActive         bool       `json:"is_active" db:"is_active"`
}

// ToleranceConfig maps to the "tolerance_configs" table.
type ToleranceConfig struct {
	ID             int        `json:"id" db:"id"`
	DeviceID       int        `json:"device_id" db:"device_id"`
	MetricName     string     `json:"metric_name" db:"metric_name"`
	ReferenceValue *float64   `json:"reference_value" db:"reference_value"`
	WarningLimit   float64    `json:"warning_limit" db:"warning_limit"`
	ActionLimit    float64    `json:"action_limit" db:"action_limit"`
	ValidFrom      time.Time  `json:"valid_from" db:"valid_from"`
	ValidTo        *time.Time `json:"valid_to" db:"valid_to"`
	CreatedBy      string     `json:"created_by" db:"created_by"`
	Notes          string     `json:"notes" db:"notes"`
}

// AuditLog maps to the "audit_log" table.
type AuditLog struct {
	ID        int       `json:"id" db:"id"`
	User      string    `json:"user" db:"user"`
	Action    string    `json:"action" db:"action"`
	ModelName string    `json:"model_name" db:"model_name"`
	ObjectID  string    `json:"object_id" db:"object_id"`
	FieldName string    `json:"field_name" db:"field_name"`
	OldValue  string    `json:"old_value" db:"old_value"`
	NewValue  string    `json:"new_value" db:"new_value"`
	Timestamp time.Time `json:"timestamp" db:"timestamp"`
	IPAddress *string   `json:"ip_address" db:"ip_address"`
}
