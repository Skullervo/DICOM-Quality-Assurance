package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
)

// Toleranssit (hyväksyttävyysrajat) per modaliteetti + metriikka. Lähde muokattaville
// rajoille; frontend yhdistää nämä config.ts:n metriikkamäärittelyihin ja piirtää
// trendikuvaajien rajaviivat näistä. Seed alustaa taulun nykyisistä config.ts-arvoista.

type tolerance struct {
	Modality    string   `json:"modality"`
	MetricID    string   `json:"metric_id"`
	Nominal     *float64 `json:"nominal"`
	LowerLimit  *float64 `json:"lower_limit"`
	UpperLimit  *float64 `json:"upper_limit"`
	ActionLimit *float64 `json:"action_limit"`
	LowerWarn   *float64 `json:"lower_warn"`
	UpperWarn   *float64 `json:"upper_warn"`
}

func fp(v float64) *float64 { return &v }

// huTol rakentaa CatPhan HU-metriikan (nominaali ±40 fail, ±20 toimintaraja) — vastaa config.ts huMetric().
func huTol(id string, nominal float64) tolerance {
	return tolerance{Modality: "CT", MetricID: id, Nominal: fp(nominal), LowerLimit: fp(nominal - 40), UpperLimit: fp(nominal + 40), ActionLimit: fp(20)}
}

// toleranceDefaults — TÄSMÄLLEEN config.ts:n MODALITY_METRICS-rajat (siemenarvot DB:hen).
var toleranceDefaults = []tolerance{
	huTol("hu_air", -1000), huTol("hu_pmp", -196), huTol("hu_ldpe", -104), huTol("hu_poly", -35),
	huTol("hu_acrylic", 120), huTol("hu_delrin", 340), huTol("hu_teflon", 990),
	{Modality: "CT", MetricID: "uniformity_index"},
	{Modality: "CT", MetricID: "mtf_50_percent"},
	{Modality: "CT", MetricID: "noise_hu_std"},
	{Modality: "CT", MetricID: "slice_thickness_mm"},

	{Modality: "XR", MetricID: "uniformity_deviation", Nominal: fp(0), UpperLimit: fp(10), UpperWarn: fp(5)},
	{Modality: "XR", MetricID: "mtf_50_percent", LowerLimit: fp(1.5), LowerWarn: fp(1.8)},
	{Modality: "XR", MetricID: "median_cnr", LowerLimit: fp(2), LowerWarn: fp(3)},
	{Modality: "XR", MetricID: "median_contrast"},
	{Modality: "XR", MetricID: "cu_100_mean"},
	{Modality: "XR", MetricID: "num_contrast_rois_seen"},

	{Modality: "US", MetricID: "s_depth"},
	{Modality: "US", MetricID: "u_cov", Nominal: fp(0), UpperLimit: fp(10), UpperWarn: fp(5)},
	{Modality: "US", MetricID: "u_skew", Nominal: fp(0), LowerLimit: fp(-1.5), UpperLimit: fp(1.5), LowerWarn: fp(-0.5), UpperWarn: fp(0.5)},
}

// EnsureTolerances luo taulun (jos puuttuu) ja siementää oletusarvot (rivit joita ei vielä ole).
func EnsureTolerances(db *sql.DB) error {
	ctx := context.Background()
	_, err := db.ExecContext(ctx, `
		IF OBJECT_ID('dbo.tolerance_config','U') IS NULL
		CREATE TABLE dbo.tolerance_config (
			modality     NVARCHAR(8)  NOT NULL,
			metric_id    NVARCHAR(64) NOT NULL,
			nominal      FLOAT NULL,
			lower_limit  FLOAT NULL,
			upper_limit  FLOAT NULL,
			action_limit FLOAT NULL,
			lower_warn   FLOAT NULL,
			upper_warn   FLOAT NULL,
			updated_at   DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
			CONSTRAINT pk_tolerance_config PRIMARY KEY (modality, metric_id)
		)`)
	if err != nil {
		return err
	}
	for _, t := range toleranceDefaults {
		_, err = db.ExecContext(ctx, `
			IF NOT EXISTS (SELECT 1 FROM tolerance_config WHERE modality=@p1 AND metric_id=@p2)
			INSERT INTO tolerance_config (modality, metric_id, nominal, lower_limit, upper_limit, action_limit, lower_warn, upper_warn)
			VALUES (@p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8)`,
			t.Modality, t.MetricID, np(t.Nominal), np(t.LowerLimit), np(t.UpperLimit), np(t.ActionLimit), np(t.LowerWarn), np(t.UpperWarn))
		if err != nil {
			return err
		}
	}
	return nil
}

// np — *float64 -> interface{} (nil => NULL).
func np(v *float64) interface{} {
	if v == nil {
		return nil
	}
	return *v
}

// GetTolerances palauttaa kaikki toleranssirivit.
func GetTolerances(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := db.QueryContext(context.Background(),
			`SELECT modality, metric_id, nominal, lower_limit, upper_limit, action_limit, lower_warn, upper_warn
			 FROM tolerance_config ORDER BY modality, metric_id`)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var out []tolerance
		for rows.Next() {
			var t tolerance
			var nom, lo, hi, act, lw, uw sql.NullFloat64
			if err := rows.Scan(&t.Modality, &t.MetricID, &nom, &lo, &hi, &act, &lw, &uw); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			t.Nominal, t.LowerLimit, t.UpperLimit = nf(nom), nf(lo), nf(hi)
			t.ActionLimit, t.LowerWarn, t.UpperWarn = nf(act), nf(lw), nf(uw)
			out = append(out, t)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(out) //nolint:errcheck
	}
}

func nf(v sql.NullFloat64) *float64 {
	if !v.Valid {
		return nil
	}
	return &v.Float64
}

// UpdateTolerance päivittää (tai lisää) yhden metriikan rajat.
func UpdateTolerance(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		modality := strings.ToUpper(chi.URLParam(r, "modality"))
		metricID := chi.URLParam(r, "metric")

		var req struct {
			Nominal     *float64 `json:"nominal"`
			LowerLimit  *float64 `json:"lower_limit"`
			UpperLimit  *float64 `json:"upper_limit"`
			ActionLimit *float64 `json:"action_limit"`
			LowerWarn   *float64 `json:"lower_warn"`
			UpperWarn   *float64 `json:"upper_warn"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid body", http.StatusBadRequest)
			return
		}
		ctx := context.Background()
		res, err := db.ExecContext(ctx,
			`UPDATE tolerance_config SET nominal=@p3, lower_limit=@p4, upper_limit=@p5,
			        action_limit=@p6, lower_warn=@p7, upper_warn=@p8, updated_at=SYSDATETIME()
			 WHERE modality=@p1 AND metric_id=@p2`,
			modality, metricID, np(req.Nominal), np(req.LowerLimit), np(req.UpperLimit),
			np(req.ActionLimit), np(req.LowerWarn), np(req.UpperWarn))
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		n, _ := res.RowsAffected()
		if n == 0 { // uusi metriikka -> lisää
			if _, err := db.ExecContext(ctx,
				`INSERT INTO tolerance_config (modality, metric_id, nominal, lower_limit, upper_limit, action_limit, lower_warn, upper_warn)
				 VALUES (@p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8)`,
				modality, metricID, np(req.Nominal), np(req.LowerLimit), np(req.UpperLimit),
				np(req.ActionLimit), np(req.LowerWarn), np(req.UpperWarn)); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"}) //nolint:errcheck
	}
}
