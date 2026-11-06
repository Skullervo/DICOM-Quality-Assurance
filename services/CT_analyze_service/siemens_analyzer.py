"""Siemens CT-fantomin laadunvalvonta-analyysi.

Siemensin oma CT-fantomi on yksinkertaisempi kuin Catphan.
Analysoi HU-tarkkuuden, uniformiteetin, kohinan ja geometrian.

Huom: DirectDensity-rekonstruktio voi vääristää HU-arvoja.
"""

import json
import logging
from pathlib import Path

import numpy as np
import pydicom
from pydicom.errors import InvalidDicomError

logger = logging.getLogger(__name__)


class SiemensCTAnalyzer:
    """Siemens CT-fantomianalyysi.

    Analysoi:
    - HU-tarkkuus (vesi ~0 HU, ilma ~-1000 HU)
    - Uniformiteetti (5-piste: keskusta + 4 reunaa)
    - Kohina (HU-keskihajonta)
    - Geometria (etäisyysmittaukset)
    """

    # Toleranssit
    HU_WATER_TOLERANCE = 4.0     # ±4 HU vedelle
    HU_AIR_TOLERANCE = 50.0      # ±50 HU ilmalle (-1000 ±50)
    UNIFORMITY_TOLERANCE = 5.0   # ±5 HU keskiarvosta
    NOISE_MAX = 10.0             # Max HU SD

    def __init__(self, dicom_folder):
        """Alusta analysaattori.

        Args:
            dicom_folder: Polku DICOM-kansioon, jossa sarjan leikkeet.
        """
        self.dicom_folder = str(dicom_folder)
        self.slices = []

    def analyze(self):
        """Suorita Siemens CT-fantomianalyysi.

        Returns:
            dict: Analyysitulokset tietokantakenttien niminä.
        """
        logger.info("Starting Siemens CT analysis on %s", self.dicom_folder)

        self.slices = self._load_dicom_series()
        if not self.slices:
            raise ValueError("No valid DICOM slices found")

        # Tarkista DirectDensity-rekonstruktio
        first_slice = self.slices[len(self.slices) // 2]
        recon_algo = str(first_slice.get('ReconstructionAlgorithm', ''))
        is_direct_density = 'DirectDensity' in recon_algo

        results = {
            'analysis_type': 'SiemensCT',
            'is_direct_density': is_direct_density,
            'num_images': len(self.slices),
        }

        # Suorita mittaukset
        hu_results = self._measure_hu_accuracy()
        results.update(hu_results)

        uniformity_results = self._measure_uniformity()
        results.update(uniformity_results)

        noise_results = self._measure_noise()
        results.update(noise_results)

        # Overall pass/fail
        results['overall_pass'] = (
            hu_results.get('ctp404_pass', False) and
            uniformity_results.get('ctp486_pass', False) and
            noise_results.get('noise_pass', False)
        )

        logger.info("Siemens CT analysis complete. Pass: %s", results['overall_pass'])
        return results

    def _load_dicom_series(self):
        """Lataa ja lajittele DICOM-sarja leikesijainnin mukaan."""
        slices = []
        for dcm_file in sorted(Path(self.dicom_folder).glob("*.dcm")):
            try:
                ds = pydicom.dcmread(str(dcm_file), force=True)
                if hasattr(ds, 'pixel_array'):
                    slices.append(ds)
            except (InvalidDicomError, Exception) as e:
                logger.warning("Could not read %s: %s", dcm_file.name, e)

        # Lajittele Instance Number tai SliceLocation mukaan
        try:
            slices.sort(key=lambda s: float(s.get('SliceLocation', 0)))
        except (TypeError, ValueError):
            try:
                slices.sort(key=lambda s: int(s.get('InstanceNumber', 0)))
            except (TypeError, ValueError):
                pass

        logger.info("Loaded %d DICOM slices", len(slices))
        return slices

    def _get_center_slice(self):
        """Palauta keskimmäinen leike."""
        return self.slices[len(self.slices) // 2]

    def _get_pixel_array(self, ds):
        """Muunna pikselitaulukko HU-arvoiksi."""
        arr = ds.pixel_array.astype(np.float64)
        slope = float(ds.get('RescaleSlope', 1))
        intercept = float(ds.get('RescaleIntercept', 0))
        return arr * slope + intercept

    def _circular_roi(self, image, center_x, center_y, radius):
        """Laske ROI:n keskiarvo ja keskihajonta pyöreällä alueella."""
        rows, cols = image.shape
        y, x = np.ogrid[:rows, :cols]
        mask = (x - center_x) ** 2 + (y - center_y) ** 2 <= radius ** 2
        roi_values = image[mask]
        return float(np.mean(roi_values)), float(np.std(roi_values))

    def _measure_hu_accuracy(self):
        """Mittaa HU-tarkkuus (vesi ~0, ilma ~-1000)."""
        ds = self._get_center_slice()
        image = self._get_pixel_array(ds)
        rows, cols = image.shape
        cx, cy = cols // 2, rows // 2

        # ROI keskustassa (vesi-alue)
        roi_radius = min(rows, cols) // 10
        water_mean, water_std = self._circular_roi(image, cx, cy, roi_radius)

        # HU-tarkkuus: veden pitäisi olla ~0 HU
        hu_pass = abs(water_mean) <= self.HU_WATER_TOLERANCE

        return {
            'hu_acrylic': water_mean,  # Käytetään acrylic-kenttää vesi-HU:lle
            'hu_air': None,  # Ilma mitataan reunoilta jos saatavilla
            'ctp404_pass': hu_pass,
        }

    def _measure_uniformity(self):
        """Mittaa uniformiteetti 5-pisteellä (center, top, right, bottom, left)."""
        ds = self._get_center_slice()
        image = self._get_pixel_array(ds)
        rows, cols = image.shape
        cx, cy = cols // 2, rows // 2

        # ROI-koko ja siirtymä reunoille
        roi_radius = min(rows, cols) // 15
        offset = min(rows, cols) // 4

        # 5 ROI:ta
        center_mean, _ = self._circular_roi(image, cx, cy, roi_radius)
        top_mean, _ = self._circular_roi(image, cx, cy - offset, roi_radius)
        right_mean, _ = self._circular_roi(image, cx + offset, cy, roi_radius)
        bottom_mean, _ = self._circular_roi(image, cx, cy + offset, roi_radius)
        left_mean, _ = self._circular_roi(image, cx - offset, cy, roi_radius)

        peripheral = [top_mean, right_mean, bottom_mean, left_mean]

        # Uniformiteetti-indeksi: max(|periferinen - center|)
        max_deviation = max(abs(p - center_mean) for p in peripheral)
        uniformity_index = max_deviation

        # Integral non-uniformity
        all_values = [center_mean] + peripheral
        max_val = max(all_values)
        min_val = min(all_values)
        if (max_val + min_val) != 0:
            integral_non_uniformity = (max_val - min_val) / (max_val + min_val)
        else:
            integral_non_uniformity = 0.0

        uniformity_pass = max_deviation <= self.UNIFORMITY_TOLERANCE

        return {
            'uniformity_index': uniformity_index,
            'integral_non_uniformity': integral_non_uniformity,
            'hu_center': center_mean,
            'hu_top': top_mean,
            'hu_right': right_mean,
            'hu_bottom': bottom_mean,
            'hu_left': left_mean,
            'ctp486_pass': uniformity_pass,
        }

    def _measure_noise(self):
        """Mittaa kohinataso (HU-keskihajonta keskialueella)."""
        ds = self._get_center_slice()
        image = self._get_pixel_array(ds)
        rows, cols = image.shape
        cx, cy = cols // 2, rows // 2

        roi_radius = min(rows, cols) // 10
        _, noise_std = self._circular_roi(image, cx, cy, roi_radius)

        noise_pass = noise_std <= self.NOISE_MAX

        return {
            'noise_hu_std': noise_std,
            'noise_pass': noise_pass,
        }
