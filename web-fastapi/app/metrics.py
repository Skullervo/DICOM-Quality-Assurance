"""QA-metriikkakonfiguraatio + tilalogiikka.

Peilaa Reactin frontend/src/lib/qa/config.ts:ää ja status.ts:ää. DB:n
tolerance_config yliajaa oletukset (kuten Go+React-versiossa).
"""
from . import db


def _m(id, label, unit="", nominal=None, lower=None, upper=None,
       action=None, lower_warn=None, upper_warn=None, prec=2):
    return dict(id=id, label=label, unit=unit, nominal=nominal, lower=lower,
               upper=upper, action=action, lower_warn=lower_warn,
               upper_warn=upper_warn, prec=prec)


def _hu(id, label, nominal):
    return _m(id, label, "HU", nominal=nominal, lower=nominal - 40,
              upper=nominal + 40, action=20, prec=0)


MODALITY_METRICS = {
    "us": [
        _m("s_depth", "Herkkyys (s_depth)", "cm", prec=2),
        _m("u_cov", "Tasaisuus (U_cov)", "%", nominal=0, upper=10, upper_warn=5, prec=2),
        _m("u_skew", "Epäsymmetria (U_skew)", "", nominal=0, lower=-1.5, upper=1.5,
           lower_warn=-0.5, upper_warn=0.5, prec=2),
    ],
    "xray": [
        _m("uniformity_deviation", "Tasaisuus — poikkeama", "%", nominal=0, upper=10, upper_warn=5, prec=2),
        _m("mtf_50_percent", "MTF 50%", "lp/mm", lower=1.5, lower_warn=1.8, prec=2),
        _m("median_cnr", "Mediaani CNR", "", lower=2, lower_warn=3, prec=2),
        _m("median_contrast", "Mediaani kontrasti", "", prec=2),
        _m("cu_100_mean", "Cu 1.0 mm", "", prec=2),
        _m("num_contrast_rois_seen", "Kontrasti-ROI", "", prec=0),
    ],
    "ct": [
        _hu("hu_air", "HU Ilma", -1000),
        _hu("hu_pmp", "HU PMP", -196),
        _hu("hu_ldpe", "HU LDPE", -104),
        _hu("hu_poly", "HU Poly", -35),
        _hu("hu_acrylic", "HU Akryyli", 120),
        _hu("hu_delrin", "HU Delrin", 340),
        _hu("hu_teflon", "HU Teflon", 990),
        _m("uniformity_index", "Uniformiteetti", "%", prec=2),
        _m("mtf_50_percent", "MTF 50%", "lp/cm", prec=2),
        _m("noise_hu_std", "Kohina (HU SD)", "HU", prec=1),
        _m("slice_thickness_mm", "Viipalepaksuus", "mm", prec=2),
    ],
}


def load_tolerances(modality):
    """Lataa DB:n tolerance_config ja yhdistä oletusmetriikkoihin (DB yliajaa).
    Palauttaa listan metriikkoja (dict) valmiina piirtoon."""
    metrics = [dict(m) for m in MODALITY_METRICS.get(modality, [])]
    try:
        rows = db.query(
            "SELECT metric_id, nominal, lower_limit, upper_limit, action_limit, lower_warn, upper_warn "
            "FROM tolerance_config WHERE modality = %s",
            (modality.upper(),),
        )
        tol = {r["metric_id"]: r for r in rows}
    except Exception:
        tol = {}
    for m in metrics:
        t = tol.get(m["id"])
        if not t:
            continue
        if t["nominal"] is not None: m["nominal"] = t["nominal"]
        if t["lower_limit"] is not None: m["lower"] = t["lower_limit"]
        if t["upper_limit"] is not None: m["upper"] = t["upper_limit"]
        if t["action_limit"] is not None: m["action"] = t["action_limit"]
        if t["lower_warn"] is not None: m["lower_warn"] = t["lower_warn"]
        if t["upper_warn"] is not None: m["upper_warn"] = t["upper_warn"]
    return metrics


def derive_status(value, m):
    """pass | warn | fail | nodata — sama logiikka kuin lib/qa/status.ts."""
    if value is None:
        return "nodata"
    v = float(value)
    if m.get("lower") is not None and v < m["lower"]:
        return "fail"
    if m.get("upper") is not None and v > m["upper"]:
        return "fail"
    if m.get("action") is not None and m.get("nominal") is not None and abs(v - m["nominal"]) > m["action"]:
        return "warn"
    if m.get("lower_warn") is not None and v < m["lower_warn"]:
        return "warn"
    if m.get("upper_warn") is not None and v > m["upper_warn"]:
        return "warn"
    return "pass"


def verdict(statuses):
    """Ankarin voittaa."""
    order = {"fail": 3, "warn": 2, "pass": 1, "nodata": 0}
    if not statuses:
        return "nodata"
    return max(statuses, key=lambda s: order.get(s, 0))
