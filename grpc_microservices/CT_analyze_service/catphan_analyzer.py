"""Catphan-fantomien laadunvalvonta-analyysi pylinac-kirjastolla.

Tukee CatPhan504 ja CatPhan600 -fantomeja.
Analysoi HU-lineaarisuuden (CTP404), uniformiteetin (CTP486),
MTF:n (CTP528) ja matalan kontrastin (CTP515).

Käsittelee automaattisesti:
- Fantomi täyttää koko FOV:n (clear_borders=False)
- Osittainen skannaus (moduulit, jotka ovat skannausalueen ulkopuolella)

ROOLI PUTKESSA: tätä luokkaa (CatphanAnalyzer) kutsuu ct_analyze_service.py sekä
event-worker. Se saa polun DICOM-kansioon (yksi CT-sarja leikkeinä), ajaa pylinac-
analyysin ja palauttaa tulokset + PNG-kuvat + HU-ROI-kartan sanakirjana.

CATPHAN-MODUULIT (pylinacin nimeämänä):
  CTP404 = HU-lineaarisuus (materiaalit: ilma, PMP, LDPE, Poly, Acryl, Delrin, Teflon)
           + leikepaksuuden mittaus. Tämä on origo, josta muut moduulit mitataan.
  CTP486 = uniformiteetti / kohina (5 ROI:ta: keskus + 4 reunaa)
  CTP528 = MTF (viivaparit, erotuskyky)
  CTP515 = matala kontrasti (CNR, näkyvyys)
"""

import json
import io
import logging
from pathlib import Path

# Headless-renderöinti: Agg-tausta pitää asettaa ENNEN pyplotin käyttöä (ei näyttöä).
import matplotlib
matplotlib.use('Agg')

from pylinac import CatPhan504, CatPhan600
from pylinac.ct import z_position  # apu: leikkeen z-sijainti (mm) metadatasta

logger = logging.getLogger(__name__)

# Tuetut CatPhan-mallit. TÄRKEÄ ERO: malleilla on ERI moduulioffsetit (etäisyys
# origosta mm). Esim. CTP528 on 504:ssä +30 mm, 600:ssa -70 mm origosta. Siksi
# väärä malli johtaa siihen, että MTF jää analysoimatta -> mallintunnistus tärkeä.
CATPHAN_MODELS = {
    'CatPhan504': CatPhan504,
    'CatPhan600': CatPhan600,
}


def _detect_catphan_model(dicom_folder):
    """Tunnista CatPhan-malli automaattisesti moduulien z-positioiden perusteella.

    Etsii origon (CTP404) ja tarkistaa minkä mallin moduulioffsetit
    sopivat parhaiten skannausalueeseen.

    Returns:
        str: Paras malli ('CatPhan504' tai 'CatPhan600'), tai None jos ei tunnistettu.
    """
    # Käytetään CatPhan504:ää origon hakuun (CTP404-moduuli on yhteinen kaikille
    # malleille, joten origo löytyy samalla tavalla mallista riippumatta).
    try:
        cat = CatPhan504(dicom_folder)
        _apply_ct_fixes(cat)
        # Nollataan käyttäjäsäädöt (siirto/kierto/koko), jotta origon haku on
        # deterministinen eikä nojaa oletussäätöihin.
        cat.x_adjustment = 0
        cat.y_adjustment = 0
        cat.angle_adjustment = 0
        cat.roi_size_factor = 1
        cat.scaling_factor = 1

        # Etsitään fantomin akseli ja origo-leike (CTP404:n sijainti pinossa).
        cat._phantom_center_func = cat.find_phantom_axis()
        origin = cat.find_origin_slice()

        # Lasketaan skannauksen z-alue (min..max mm) ja origon absoluuttinen z.
        z_positions = [z_position(m) for m in cat.dicom_stack.metadatas]
        min_z = min(z_positions)
        max_z = max(z_positions)
        origin_z = cat.dicom_stack[origin].z_position
    except Exception as e:
        logger.warning("Could not detect CatPhan model: %s", e)
        return None

    # Tarkistetaan kummankin mallin kohdalla, kuinka moni sen moduuleista osuu
    # skannausalueelle (origon z + moduulin offset mahtuu min_z..max_z väliin).
    best_model = None
    best_count = -1

    for model_name, model_class in CATPHAN_MODELS.items():
        total = len(model_class.modules)
        covered = 0
        for mod_class, config in model_class.modules.items():
            mod_z = origin_z + config["offset"]
            if min_z <= mod_z <= max_z:
                covered += 1

        logger.info(
            "Model %s: %d/%d modules in scan range (origin=%.1f, range=%.1f–%.1f)",
            model_name, covered, total, origin_z, min_z, max_z
        )

        # Valintalogiikka: suositaan mallia, jonka KAIKKI moduulit kattavat
        # skannaus (covered == total). Jos useampi täydellinen, valitaan se jossa
        # on eniten moduuleja. Jos mikään ei ole täydellinen, otetaan varalta malli
        # jonka kattavuus on paras (best_model vielä None).
        if covered == total and total > best_count:
            best_model = model_name
            best_count = total
        elif best_model is None and covered > best_count:
            best_model = model_name
            best_count = covered

    logger.info("Auto-detected CatPhan model: %s", best_model)
    return best_model


def _build_partial_catphan_class(base_class, dicom_folder):
    """Luo CatPhan-alaluokka, joka sisältää vain skannauksen kattamat moduulit.

    Jos skannaus ei kata kaikkia moduuleja (esim. CTP528 on FOV:n ulkopuolella),
    tämä luo räätälöidyn luokan jossa vain kattavat moduulit ovat mukana.

    MIKSI: pylinac nostaa ValueError("physical scan extent does not match"), jos
    jokin moduuli (esim. CTP528 +30 mm origosta) jää skannausalueen ulkopuolelle.
    Tämä on yleistä osittaisissa kliinisissä skannauksissa. Ratkaisu: rakennetaan
    DYNAAMISESTI alaluokka, jonka 'modules'-sanakirjaan jätetään vain ne moduulit,
    jotka mahtuvat z-alueelle -> analyysi onnistuu ilman puuttuvia moduuleja.
    """
    # Alustetaan väliaikainen instanssi jotta saadaan origin_slice
    cat = base_class(dicom_folder)
    _apply_ct_fixes(cat)
    cat.x_adjustment = 0
    cat.y_adjustment = 0
    cat.angle_adjustment = 0
    cat.roi_size_factor = 1
    cat.scaling_factor = 1

    cat._phantom_center_func = cat.find_phantom_axis()
    origin = cat.find_origin_slice()
    cat.origin_slice = origin

    z_positions = [z_position(m) for m in cat.dicom_stack.metadatas]
    min_z = min(z_positions)
    max_z = max(z_positions)
    abs_origin_z = cat.dicom_stack[origin].z_position

    # Jaetaan moduulit kahteen: skannauksen SISÄLLÄ olevat (included) ja sen
    # ULKOPUOLELLE jäävät (excluded). Vain included otetaan uuteen luokkaan.
    included_modules = {}
    excluded = []
    for mod, config in base_class.modules.items():
        mod_z = abs_origin_z + config["offset"]
        if min_z <= mod_z <= max_z:
            included_modules[mod] = config
        else:
            excluded.append(f"{mod.__name__} (offset={config['offset']}, z={mod_z:.1f})")

    if excluded:
        logger.warning(
            "Scan range %.1f–%.1f mm does not cover all modules. "
            "Excluded: %s", min_z, max_z, ", ".join(excluded)
        )

    if not excluded:
        return None  # Kaikki moduulit kattavat, ei tarvetta räätälöidylle luokalle

    # type(nimi, (kantaluokka,), {attribuutit}) luo luokan AJONAIKAISESTI. Tässä
    # peritään alkuperäinen CatPhan-luokka mutta korvataan 'modules' karsitulla
    # listalla -> pylinac analysoi vain mahtuvat moduulit.
    partial_class = type(
        f"Partial{base_class.__name__}",
        (base_class,),
        {"modules": included_modules}
    )
    return partial_class


def _apply_ct_fixes(catphan):
    """Sovella CT-skannerispesifisiä korjauksia pylinac-instanssiin.

    - clear_borders=False kun fantomi täyttää >85% FOV:sta

    MIKSI: pylinacin oletus clear_borders=True poistaa kuvan reunoihin osuvat
    alueet. Kliinisillä CT-skannereilla fantomi (esim. 202 mm) täyttää lähes koko
    kuva-alan (esim. 205 mm FOV), jolloin clear_borders poistaisi itse fantomin ->
    analyysi epäonnistuisi. Siksi reunansiivous kytketään pois, kun fantomin
    halkaisija on yli 85 % kuva-alasta.
    """
    # FOV (mm) = sarakkeiden lkm * pikselikoko; fantomin halkaisija = 2 * säde.
    fov_mm = catphan.dicom_stack.metadata.Columns * catphan.mm_per_pixel
    phantom_diameter_mm = 2 * catphan.catphan_radius_mm
    if phantom_diameter_mm / fov_mm > 0.85:
        logger.info(
            "Phantom fills >85%% of FOV (%.0f/%.0f mm), disabling clear_borders",
            phantom_diameter_mm, fov_mm
        )
        catphan.clear_borders = False


class CatphanAnalyzer:
    """Catphan-fantomianalyysi pylinac-kirjastolla."""

    SUPPORTED = CATPHAN_MODELS

    def __init__(self, dicom_folder, phantom_model='auto'):
        """Alusta analysaattori.

        Args:
            dicom_folder: Polku DICOM-kansioon, jossa sarjan leikkeet.
            phantom_model: 'CatPhan504', 'CatPhan600' tai 'auto' (automaattitunnistus).
        """
        self.dicom_folder = str(dicom_folder)

        # 'auto' = yritä tunnistaa malli automaattisesti z-positioiden perusteella.
        # Jos tunnistus epäonnistuu, oletetaan CatPhan504 (yleisin).
        if phantom_model == 'auto':
            detected = _detect_catphan_model(dicom_folder)
            if detected is None:
                phantom_model = 'CatPhan504'  # oletus jos tunnistus epäonnistuu
                logger.warning("Auto-detection failed, defaulting to %s", phantom_model)
            else:
                phantom_model = detected

        if phantom_model not in self.SUPPORTED:
            raise ValueError(f"Tuntematon fantomi: {phantom_model}. "
                             f"Tuetut: {list(self.SUPPORTED.keys())}")
        self.phantom_class = self.SUPPORTED[phantom_model]
        self.phantom_model = phantom_model

    def analyze(self, hu_tolerance=40, scaling_tolerance=1,
                thickness_tolerance=0.2, low_contrast_tolerance=1):
        """Suorita Catphan-analyysi.

        Käsittelee automaattisesti:
        1. Fantomi täyttää FOV:n → clear_borders=False
        2. Osittainen skannaus → poistetaan moduulit jotka eivät kata skannausta

        Returns:
            dict: {'results': pylinac results_data, 'images': {name: bytes}}
        """
        logger.info("Starting %s analysis on %s", self.phantom_model, self.dicom_folder)

        # 1. YRITYS: täysi analyysi kaikilla moduuleilla (FOV-korjaus sovellettu).
        catphan = self.phantom_class(self.dicom_folder)
        _apply_ct_fixes(catphan)

        try:
            catphan.analyze(
                hu_tolerance=hu_tolerance,
                scaling_tolerance=scaling_tolerance,
                thickness_tolerance=thickness_tolerance,
                low_contrast_tolerance=low_contrast_tolerance,
            )
        except ValueError as e:
            # Käsitellään VAIN "physical scan extent" -virhe (osittainen skannaus).
            # Muut ValueError-virheet nostetaan edelleen (ei piiloteta oikeita bugeja).
            if "physical scan extent" in str(e):
                logger.warning(
                    "Full %s analysis failed (scan extent): %s. "
                    "Trying with partial module set.",
                    self.phantom_model, e
                )
                # 2. YRITYS: rakennetaan karsittu luokka vain mahtuvilla moduuleilla.
                partial_class = _build_partial_catphan_class(
                    self.phantom_class, self.dicom_folder
                )
                if partial_class is None:
                    raise  # ei karsittavaa -> ei voida korjata, nostetaan virhe

                catphan = partial_class(self.dicom_folder)
                _apply_ct_fixes(catphan)
                catphan.analyze(
                    hu_tolerance=hu_tolerance,
                    scaling_tolerance=scaling_tolerance,
                    thickness_tolerance=thickness_tolerance,
                    low_contrast_tolerance=low_contrast_tolerance,
                )
                logger.info("Partial %s analysis succeeded", self.phantom_model)
            else:
                raise

        # Kerätään tulokset: metriikat (dict), analyysikuvat (PNG-tavut) ja HU-ROI-
        # kartta (interaktiivista overlayta varten).
        results = catphan.results_data(as_dict=True)
        images = self._capture_images(catphan)
        hu_roi_map = self._extract_hu_rois(catphan)

        logger.info("%s analysis complete. Overall pass: %s",
                     self.phantom_model, results.get('passed'))

        return {'results': results, 'images': images, 'hu_roi_map': hu_roi_map}

    def _capture_images(self, catphan):
        """Tallenna moduulien CT-leikekuvat ja analyysikuvaajat PNG-tavuiksi.

        Leikekuvat renderöidään mustalla taustalla ilman otsikkoa/akseleita.
        Analyysikuvaajat käyttävät tummaa teemaa (dark_background).

        Leikekuvat (oikeat CT-leikkeet ROI-merkinnöillä):
            'hu_linearity'  → CTP404 leike VAIN materiaali-ROI:t (HU-arvot)
            'thickness'     → CTP404 leike VAIN leikepaksuus-ramppi-ROI:t
            'uniformity'    → CTP486 leike uniformiteetti-ROI:den kanssa
            'mtf'           → CTP528 leike viivapari-kuvioiden kanssa
            'low_contrast'  → CTP515 leike matalan kontrastin kohteiden kanssa

        Analyysikuvaajat (matplotlib-kaaviot, tumma teema):
            'hu_linearity_chart' → HU-lineaarisuus scatter plot
            'mtf_chart'          → MTF-käyrä (modulaation siirtofunktio)
            'uniformity_profile' → Uniformiteettiprofiilit (horisontaali + vertikaali)
            'side_view'          → Sivunäkymä (moduulien z-asemat)

        Returns:
            dict: {'hu_linearity': bytes, 'thickness': bytes, 'hu_linearity_chart': bytes, ...}
        """
        import matplotlib.pyplot as plt
        import numpy as np

        images = {}  # kerätään nimi -> PNG-tavut; palautetaan lopuksi

        # --- CTP404: kaksi erillistä kuvaa ---
        # 1) Vain HU materiaali-ROI:t (HU-lineaarisuusvälilehti)
        try:
            ctp404 = catphan.ctp404
            fig, ax = plt.subplots(figsize=(6, 6))
            ax.imshow(ctp404.image.array, cmap='gray',
                      vmin=ctp404.window_min, vmax=ctp404.window_max)
            for roi in ctp404.rois.values():
                roi.plot2axes(ax, edgecolor=roi.plot_color)
            for roi in ctp404.background_rois.values():
                roi.plot2axes(ax, edgecolor='blue')
            ax.autoscale(tight=True)
            ax.axis('off')
            ax.set_title('')
            fig.set_facecolor('black')
            buf = io.BytesIO()
            fig.savefig(buf, format='png', facecolor='black',
                        bbox_inches='tight', pad_inches=0, dpi=150)
            plt.close(fig)
            buf.seek(0)
            images['hu_linearity'] = buf.read()
        except Exception as e:
            logger.warning("Could not generate hu_linearity (material) image: %s", e)

        # 1b) Puhdas CTP404-leike ILMAN poltettuja ROI-ympyröitä (interaktiiviselle
        # SVG-overlaylle). plt.imsave kirjoittaa taulukon 1:1 pikseleiksi, joten
        # normalisoidut ROI-koordinaatit (_extract_hu_rois) osuvat kohdalleen.
        try:
            ctp404 = catphan.ctp404
            arr = ctp404.image.array.astype(float)
            # Ikkunointi (window min/max) määrää harmaasävyalueen. Jos pylinac ei
            # anna ikkuna-arvoja, käytetään 1.–99. prosenttipisteitä (poistaa
            # ääripikselit). Normalisoidaan arvot välille 0..1; +1e-9 estää nollajaon.
            wmin = getattr(ctp404, 'window_min', None)
            wmax = getattr(ctp404, 'window_max', None)
            if wmin is None or wmax is None:
                lo, hi = float(np.percentile(arr, 1)), float(np.percentile(arr, 99))
            else:
                lo, hi = float(wmin), float(wmax)
            normed = np.clip((arr - lo) / (hi - lo + 1e-9), 0.0, 1.0)
            buf = io.BytesIO()
            plt.imsave(buf, normed, cmap='gray', format='png', vmin=0.0, vmax=1.0)
            buf.seek(0)
            images['hu_linearity_clean'] = buf.read()
        except Exception as e:
            logger.warning("Could not generate clean CTP404 slice: %s", e)

        # 2) Vain leikepaksuus-ramppi-ROI:t (Leikepaksuus-välilehti)
        try:
            ctp404 = catphan.ctp404
            fig, ax = plt.subplots(figsize=(6, 6))
            ax.imshow(ctp404.image.array, cmap='gray',
                      vmin=ctp404.window_min, vmax=ctp404.window_max)
            for roi in ctp404.thickness_rois.values():
                roi.plot2axes(ax, edgecolor='cyan')
            if hasattr(ctp404, 'lines'):
                for line in ctp404.lines.values():
                    line.plot2axes(ax, color=line.pass_fail_color)
            ax.autoscale(tight=True)
            ax.axis('off')
            ax.set_title('')
            fig.set_facecolor('black')
            buf = io.BytesIO()
            fig.savefig(buf, format='png', facecolor='black',
                        bbox_inches='tight', pad_inches=0, dpi=150)
            plt.close(fig)
            buf.seek(0)
            images['thickness'] = buf.read()
        except Exception as e:
            logger.warning("Could not generate thickness image: %s", e)

        # --- Muut leikekuvat (uniformiteetti, MTF, matala kontrasti) ---
        # pylinacin plot_analyzed_subimage piirtää valmiiksi oikean moduulin
        # leikkeen ROI-merkintöineen. Avaimet: 'un'=uniformiteetti, 'sp'=MTF
        # (spatial), 'lc'=low contrast. Tallennetaan mustalla taustalla.
        slice_map = {
            'uniformity': 'un',
            'mtf': 'sp',
            'low_contrast': 'lc',
        }

        for image_key, subimage_type in slice_map.items():
            try:
                fig = catphan.plot_analyzed_subimage(subimage_type, show=False)
                if fig is None:
                    continue
                for ax in fig.axes:
                    ax.set_title('')
                fig.set_facecolor('black')
                buf = io.BytesIO()
                fig.savefig(buf, format='png', facecolor='black',
                            bbox_inches='tight', pad_inches=0, dpi=150)
                plt.close(fig)
                buf.seek(0)
                images[image_key] = buf.read()
            except Exception as e:
                logger.warning("Could not generate %s image: %s", image_key, e)

        # --- Analyysikuvaajat — tumma teema ---
        # Nämä ovat kaavioita (ei leikekuvia): HU-lineaarisuus-scatter, MTF-käyrä,
        # uniformiteettiprofiilit ja sivunäkymä. Piirretään dark_background-teemalla
        # ja asetetaan taustaväri käyttöliittymän sävyyn (#1e2535).
        chart_map = {
            'hu_linearity_chart': 'lin',
            'mtf_chart': 'mtf',
            'uniformity_profile': 'prof',
            'side_view': 'side',
        }

        with plt.style.context('dark_background'):
            for image_key, subimage_type in chart_map.items():
                try:
                    fig = catphan.plot_analyzed_subimage(subimage_type, show=False)
                    if fig is None:
                        continue
                    fig.set_facecolor('#1e2535')
                    for ax in fig.axes:
                        ax.set_facecolor('#1e2535')
                    buf = io.BytesIO()
                    fig.savefig(buf, format='png', facecolor='#1e2535',
                                bbox_inches='tight', dpi=150)
                    plt.close(fig)
                    buf.seek(0)
                    images[image_key] = buf.read()
                except Exception as e:
                    logger.warning("Could not generate %s chart: %s", image_key, e)

        return images

    def _extract_hu_rois(self, catphan):
        """Poimi CTP404:n HU-materiaali-ROI:t normalisoituina (0..1) koordinaatteina.

        Koordinaatit ovat ctp404.image.array-avaruudessa; normalisointi kuvan
        mittoihin osuu 'hu_linearity_clean'-leikkeeseen (plt.imsave 1:1).
        Palauttaa listan {id, name, x, y, r} — id vastaa metriikka-id:tä (hu_air ...).
        """
        # Materiaalin nimi -> metriikka-id (sama id jolla HU-arvo tallennetaan DB:hen),
        # jotta käyttöliittymä osaa yhdistää ROI-ympyrän oikeaan mittausarvoon.
        name_to_id = {
            'Air': 'hu_air', 'PMP': 'hu_pmp', 'LDPE': 'hu_ldpe', 'Poly': 'hu_poly',
            'Acrylic': 'hu_acrylic', 'Delrin': 'hu_delrin', 'Teflon': 'hu_teflon',
        }
        rois = []
        try:
            ctp404 = catphan.ctp404
            # h, w = kuvan korkeus/leveys. Koordinaatit normalisoidaan jakamalla
            # näillä -> arvot 0..1, jotka osuvat 'hu_linearity_clean'-leikkeeseen.
            h, w = ctp404.image.array.shape[:2]
            for name, roi in ctp404.rois.items():
                center = getattr(roi, 'center', None)
                radius = getattr(roi, 'radius', None)
                cx = getattr(center, 'x', None) if center is not None else None
                cy = getattr(center, 'y', None) if center is not None else None
                if cx is None or cy is None or radius is None:
                    continue
                rois.append({
                    'id': name_to_id.get(name, 'hu_' + str(name).lower()),
                    'name': name,
                    'x': round(float(cx) / w, 5),
                    'y': round(float(cy) / h, 5),
                    'r': round(float(radius) / w, 5),
                })
        except Exception as e:
            logger.warning("Could not extract HU ROIs: %s", e)
        return rois

    @staticmethod
    def extract_metrics(results):
        """Muunna pylinacin tulokset tietokantakenttien nimiksi.

        Args:
            results: pylinac results_data(as_dict=True) palautus.

        Returns:
            dict: Tietokantakenttien nimiä vastaavat arvot.
        """
        def safe_float(val, default=None):
            if val is None:
                return default
            try:
                return float(val)
            except (TypeError, ValueError):
                return default

        metrics = {}

        # CTP404 — HU-lineaarisuus.
        # HUOM None-turvallisuus: käytetään 'results.get(x) or {}' eikä
        # 'results.get(x, {})'. Osittaisessa analyysissä pylinac voi palauttaa
        # NIMENOMAAN None (ei puuttuva avain), jolloin oletusarvo {} ei auttaisi.
        # 'or {}' korvaa myös None:n tyhjällä sanakirjalla -> .get ei kaadu.
        ctp404 = results.get('ctp404') or {}
        hu_rois = ctp404.get('hu_rois') or {}

        metrics['hu_air'] = safe_float(hu_rois.get('Air', {}).get('value'))
        metrics['hu_pmp'] = safe_float(hu_rois.get('PMP', {}).get('value'))
        metrics['hu_ldpe'] = safe_float(hu_rois.get('LDPE', {}).get('value'))
        metrics['hu_poly'] = safe_float(hu_rois.get('Poly', {}).get('value'))
        metrics['hu_acrylic'] = safe_float(hu_rois.get('Acrylic', {}).get('value'))
        metrics['hu_delrin'] = safe_float(hu_rois.get('Delrin', {}).get('value'))
        metrics['hu_teflon'] = safe_float(hu_rois.get('Teflon', {}).get('value'))
        metrics['slice_thickness_mm'] = safe_float(ctp404.get('measured_slice_thickness_mm'))
        metrics['ctp404_pass'] = ctp404.get('hu_linearity_passed')

        # Phantom-geometria
        metrics['phantom_roll_deg'] = safe_float(results.get('catphan_roll_deg'))
        metrics['origin_slice'] = results.get('origin_slice')

        # CTP486 — Uniformiteetti
        ctp486 = results.get('ctp486') or {}
        uniformity_rois = ctp486.get('rois') or {}

        metrics['uniformity_index'] = safe_float(ctp486.get('uniformity_index'))
        metrics['integral_non_uniformity'] = safe_float(
            ctp486.get('integral_non_uniformity'))
        metrics['hu_center'] = safe_float(uniformity_rois.get('Center', {}).get('value'))
        metrics['hu_top'] = safe_float(uniformity_rois.get('Top', {}).get('value'))
        metrics['hu_right'] = safe_float(uniformity_rois.get('Right', {}).get('value'))
        metrics['hu_bottom'] = safe_float(uniformity_rois.get('Bottom', {}).get('value'))
        metrics['hu_left'] = safe_float(uniformity_rois.get('Left', {}).get('value'))
        metrics['ctp486_pass'] = ctp486.get('passed')

        # Kohinataso (HU keskihajonta keskellä)
        center_std = uniformity_rois.get('Center', {}).get('stdev')
        metrics['noise_hu_std'] = safe_float(center_std)

        # CTP528 — MTF. Voi puuttua kokonaan osittaisessa analyysissä (jos CTP528
        # oli skannausalueen ulkopuolella) -> 'or {}' suojaa None-tapaukselta.
        ctp528 = results.get('ctp528') or {}
        mtf_values = ctp528.get('mtf_lp_mm', {})

        # MTF-avaimet voivat olla str ("50") tai int (50) pylinac-versiosta riippuen
        # -> kokeillaan molempia. "50 %" = erotuskyky (lp/mm) 50 % MTF:n kohdalla.
        metrics['mtf_50_percent'] = safe_float(mtf_values.get('50') or mtf_values.get(50))
        metrics['mtf_10_percent'] = safe_float(mtf_values.get('10') or mtf_values.get(10))
        metrics['mtf_data'] = json.dumps(mtf_values) if mtf_values else None
        metrics['ctp528_pass'] = ctp528.get('passed')

        # CTP515 — Matala kontrasti (voi puuttua osittaisessa analyysissä)
        ctp515 = results.get('ctp515') or {}

        metrics['num_low_contrast_rois_seen'] = ctp515.get('num_rois_seen')
        metrics['median_cnr'] = safe_float(ctp515.get('cnr'))
        metrics['ctp515_pass'] = ctp515.get('passed')

        # Matalan kontrastin yksityiskohdat JSON:na
        lc_rois = ctp515.get('rois', {})
        if lc_rois:
            metrics['low_contrast_details'] = json.dumps(lc_rois)

        # Overall pass
        metrics['overall_pass'] = results.get('passed')

        return metrics
