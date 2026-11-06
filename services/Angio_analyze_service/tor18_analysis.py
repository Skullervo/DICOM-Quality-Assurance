"""Leeds TOR-18 (fluoroscopy / angiography) QA analysis — core module.

Wraps pylinac ``LeedsTOR`` (same algorithm as MIPT-Oulu/automated-rt-qa
``tor_18_analysis``) but adapted to clinical Philips Azurion XA images, which differ
from pylinac's demo image in three ways that break the stock loader/detector:

  1. 12-bit Modality LUT (``uint12``) that pydicom cannot apply  -> we drop the LUT
     and read the raw rescaled pixels.
  2. No ``PixelSpacing`` (only ``ImagerPixelSpacing``)           -> we pass ``dpi``.
  3. The phantom is magnified and surrounded by a large saturated border, so the
     magnification-dependent ``is_right_size`` gate rejects it  -> ``AngioLeeds``
     drops that gate and self-calibrates the high-res block scale off the detected
     phantom disc (see ``AngioLeeds``).

Metrics that are reliable on this data: low-contrast detectability
(``num_contrast_rois_seen``, ``median_cnr``, ``median_contrast``) and uniformity
(``percent_integral_uniformity``). High-contrast MTF is BEST-EFFORT only: the
line-pair ROI registration is not reliable on the magnified Azurion geometry, so
``mtf_50_percent`` is stored for information but has no tolerance (see config.ts /
tolerances seed). TODO: tune high-contrast registration (angle + block scale).

Public API:
  analyze_dicom_bytes(data)                  -> AngioResult
  extract_dicom_metadata(ds)                 -> dict
  AngioResult(metrics, overlay_png, phantom_center, raw)
"""
import os
import io
import tempfile
import logging
import warnings
from dataclasses import dataclass, field

import numpy as np
import pydicom

import matplotlib
matplotlib.use("Agg")  # headless, must precede pyplot
import matplotlib.pyplot as plt  # noqa: E402

from pylinac import LeedsTOR  # noqa: E402
from pylinac.planar_imaging import is_centered  # noqa: E402

warnings.filterwarnings("ignore")
logger = logging.getLogger("angio.tor18")

# QA sensitivity knobs (preliminary; physicist-pending — see tolerances seed).
VISIBILITY_THRESHOLD = float(os.getenv("ANGIO_VISIBILITY_THRESHOLD", "10"))
LOW_CONTRAST_THRESHOLD = float(os.getenv("ANGIO_LOW_CONTRAST_THRESHOLD", "0.005"))
ANALYSIS_VERSION = "tor18-leeds-1"


class AngioLeeds(LeedsTOR):
    """LeedsTOR adapted for magnified XA fluoroscopy images.

    The phantom disc is reliably found by Canny, but pylinac's ``is_right_size``
    gate assumes the phantom bounding box equals ``21904 mm2 * dpmm^2 * magnification^2``;
    on Azurion the magnification is unknown (no SAD/SSD tags) so the gate rejects the
    disc. We detect by centering only and take the largest centered region, then make
    the high-res block search scale self-calibrate off the actually-detected disc so
    ROI placement no longer depends on the (unknown) magnification.
    """
    detection_conditions = [is_centered]

    @property
    def phantom_bbox_size_px(self):  # type: ignore[override]
        return self.phantom_ski_region.bbox_area


@dataclass
class AngioResult:
    metrics: dict
    overlay_png: bytes | None
    phantom_center: tuple | None
    raw: dict = field(default_factory=dict)


def _load_leeds(data: bytes) -> AngioLeeds:
    """Build an AngioLeeds from raw DICOM bytes, handling the XA quirks."""
    ds = pydicom.dcmread(io.BytesIO(data), force=True)
    for tag in ("ModalityLUTSequence", "VOILUTSequence"):
        if tag in ds:
            delattr(ds, tag)
    ips = ds.get("ImagerPixelSpacing") or ds.get("PixelSpacing")
    if not ips:
        raise ValueError("No ImagerPixelSpacing/PixelSpacing — cannot set dpi")
    dpi = 25.4 / float(ips[0])
    tmp = tempfile.NamedTemporaryFile(suffix=".dcm", delete=False)
    try:
        ds.save_as(tmp.name)
        tmp.close()
        return AngioLeeds(tmp.name, image_kwargs={"dpi": dpi})
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


def _mtf_at(mtf_lp_mm: list, pct: str) -> float | None:
    """Pull the lp/mm value at a given MTF percentage from pylinac's list-of-dicts."""
    for entry in mtf_lp_mm or []:
        if pct in entry:
            v = entry[pct]
            return float(v) if v is not None else None
    return None


def _render_overlay(analyzer: AngioLeeds) -> bytes | None:
    """Render the analyzed phantom (disc outline + ROI overlay) as a PNG for S3."""
    try:
        fig = plt.figure(figsize=(7, 7))
        analyzer.plot_analyzed_image(image=True, low_contrast=False, high_contrast=False, show=False)
        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=110, bbox_inches="tight")
        plt.close(fig)
        return buf.getvalue()
    except Exception as e:  # noqa: BLE001 — overlay is best-effort
        logger.warning("Overlay render failed: %s", e)
        plt.close("all")
        return None


def analyze_dicom_bytes(data: bytes) -> AngioResult:
    """Run the Leeds TOR-18 analysis on a single XA DICOM (bytes).

    Returns normalized metrics, an overlay PNG (for S3), and the detected center.
    Raises on failure (caller marks the job FAILED).
    """
    analyzer = _load_leeds(data)
    kw = dict(ssd="auto", low_contrast_threshold=LOW_CONTRAST_THRESHOLD,
              visibility_threshold=VISIBILITY_THRESHOLD)
    try:
        analyzer.analyze(**kw)
    except ValueError as e:
        # High-contrast (MTF) line-pair block not found on this magnified geometry.
        # MTF is best-effort anyway: drop it and keep the reliable low-contrast +
        # uniformity metrics rather than failing the whole measurement.
        if "high-resolution block" in str(e) or "high res" in str(e).lower():
            logger.warning("High-res (MTF) block not found — analyzing low-contrast only: %s", e)
            analyzer = _load_leeds(data)
            analyzer.high_contrast_roi_settings = {}
            analyzer.analyze(**kw)
        else:
            raise
    r = analyzer.results_data(as_dict=True)

    center = r.get("phantom_center_x_y")
    metrics = {
        # Reliable low-contrast + uniformity metrics
        "num_contrast_rois_seen": _as_int(r.get("num_contrast_rois_seen")),
        "median_cnr": _as_float(r.get("median_cnr")),
        "median_contrast": _as_float(r.get("median_contrast")),
        "percent_integral_uniformity": _as_float(r.get("percent_integral_uniformity")),
        "phantom_area": _as_float(r.get("phantom_area")),
        # High-contrast MTF — BEST-EFFORT only (no tolerance); see module docstring.
        "mtf_50_percent": _mtf_at(r.get("mtf_lp_mm"), "50"),
    }
    overlay = _render_overlay(analyzer)
    return AngioResult(
        metrics=metrics,
        overlay_png=overlay,
        phantom_center=tuple(center) if center else None,
        raw=r,
    )


def _as_float(v):
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def _as_int(v):
    try:
        return int(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def extract_dicom_metadata(ds) -> dict:
    """XA acquisition + device metadata for the angio_analysis row."""
    def g(tag, default=""):
        return str(ds.get(tag, default))

    def gnum(tag):
        v = ds.get(tag)
        try:
            return float(v) if v is not None else None
        except (TypeError, ValueError):
            return None

    ips = ds.get("ImagerPixelSpacing") or ds.get("PixelSpacing")
    return {
        "institution_name": g("InstitutionName", "Unknown"),
        "institutional_department_name": g("InstitutionalDepartmentName", ""),
        "manufacturer": g("Manufacturer", "Unknown"),
        "manufacturer_model_name": g("ManufacturerModelName", ""),
        "modality": g("Modality", "XA"),
        "station_name": g("StationName", "Unknown"),
        "device_serial_number": g("DeviceSerialNumber", ""),
        "study_date": g("StudyDate", ""),
        "series_date": g("SeriesDate", ""),
        "content_date": g("ContentDate", ""),
        "content_time": g("ContentTime", ""),
        "kvp": gnum("KVP"),
        "exposure_mas": gnum("ExposuremAs") or gnum("Exposure"),
        "distance_source_to_detector": gnum("DistanceSourceToDetector"),
        "imager_pixel_spacing": float(ips[0]) if ips else None,
    }
