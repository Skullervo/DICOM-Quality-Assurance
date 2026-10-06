"""Ultraääni-näkymät: laitokset → laitteet → laitenäkymä (trendit).

SQL peilaa Go-backendin handlers/ultrasound.go:ta (taulu `ultrasound`, legacy
alaviivattomat sarakenimet, `tranducertype` sic).
"""
import json
from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse

from .. import db, auth, metrics
from ..templating import render

router = APIRouter()


def _guard(request: Request):
    return None if auth.is_authed(request) else RedirectResponse("/login", status_code=303)


@router.get("/us/institutions")
def us_institutions(request: Request):
    if (r := _guard(request)):
        return r
    rows = db.query(
        "SELECT institutionname AS name, "
        "COUNT(DISTINCT stationname) AS device_count, "
        "COUNT(*) AS measurement_count "
        "FROM ultrasound WHERE institutionname != '' "
        "GROUP BY institutionname ORDER BY institutionname"
    )
    return render(request, "us/institutions.html", institutions=rows)


@router.get("/us/units")
def us_units(request: Request, institution: str = ""):
    if (r := _guard(request)):
        return r
    sql = (
        "SELECT stationname AS station_name, institutionname AS institution_name, "
        "manufacturer, manufacturermodelname AS manufacturer_model, "
        "FORMAT(MAX(processed_at),'yyyy-MM-dd') AS last_measurement, "
        "COUNT(*) AS measurement_count "
        "FROM ultrasound WHERE stationname != '' "
    )
    params = ()
    if institution:
        sql += "AND institutionname = %s "
        params = (institution,)
    sql += ("GROUP BY stationname, institutionname, manufacturer, manufacturermodelname "
            "ORDER BY institutionname, stationname")
    rows = db.query(sql, params)
    return render(request, "us/units.html", units=rows, institution=institution)


@router.get("/us/device/{station}")
def us_device(request: Request, station: str):
    if (r := _guard(request)):
        return r

    # Trendisarja (aikajärjestyksessä)
    series = db.query(
        "SELECT studydate AS study_date, s_depth, u_cov, u_skew, "
        "tranducertype AS transducer_type, instance "
        "FROM ultrasound WHERE stationname = %s ORDER BY studydate",
        (station,),
    )
    # Viimeisimmät mittaukset (taulukko)
    detail = db.query(
        "SELECT TOP 100 instance, institutionname AS institution_name, "
        "manufacturer, manufacturermodelname AS manufacturer_model, "
        "tranducertype AS transducer_type, studydate AS study_date, "
        "s_depth, u_cov, u_skew, deviceserialnumber AS serial, "
        "FORMAT(processed_at,'yyyy-MM-dd HH:mm') AS processed_at "
        "FROM ultrasound WHERE stationname = %s ORDER BY processed_at DESC",
        (station,),
    )

    mdefs = metrics.load_tolerances("us")
    latest = detail[0] if detail else {}

    # KPI-kortit: viimeisin arvo + tila per metriikka
    kpis = []
    for m in mdefs:
        val = latest.get(m["id"]) if latest else None
        kpis.append({
            "def": m,
            "value": val,
            "status": metrics.derive_status(val, m),
        })
    overall = metrics.verdict([k["status"] for k in kpis if k["value"] is not None])

    # Trendidata (per metriikka) — matkii Reactin TrendChartia:
    #  - history: {date, value}
    #  - status: metriikan tila viimeisimmästä arvosta (KAIKKI pisteet tämä väri)
    #  - y-domain (lo/hi) nominaalista + rajoista + arvoista, +15% padding, 3 tickiä
    charts = []
    for m, k in zip(mdefs, kpis):
        history = [{"date": (row.get("study_date") or ""),
                    "value": (None if row.get(m["id"]) is None else float(row.get(m["id"])))}
                   for row in series]
        vals = [h["value"] for h in history if h["value"] is not None]
        cand = [x for x in [m.get("nominal"), m.get("lower"), m.get("upper"), *vals] if x is not None]
        lo = min(cand) if cand else 0.0
        hi = max(cand) if cand else 1.0
        if lo == hi:
            e = max(abs(lo) * 0.05, 1.0)
            lo -= e; hi += e
        pad = (hi - lo) * 0.15
        lo -= pad; hi += pad
        charts.append({
            "def": m, "history": history, "status": k["status"],
            "lo": lo, "hi": hi,
        })

    info = {
        "station": station,
        "institution": latest.get("institution_name") if latest else "",
        "manufacturer": latest.get("manufacturer") if latest else "",
        "model": latest.get("manufacturer_model") if latest else "",
        "serial": latest.get("serial") if latest else "",
        "n": len(series),
    }

    return render(
        request, "us/device.html",
        station=station, info=info, kpis=kpis, overall=overall,
        charts_json=json.dumps(charts), detail=detail, mdefs=mdefs,
    )
