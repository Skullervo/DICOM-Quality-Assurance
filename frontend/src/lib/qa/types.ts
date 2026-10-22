// =============================================================================
// lib/qa/types.ts — QA-datan yhteiset tyypit (modaliteetista riippumaton malli)
// =============================================================================
// Tämä tiedosto määrittelee "laadunvalvonta-automaatin" tietomallin, jota CT-,
// XR-, US- ja ANGIO-laitesivut käyttävät samalla tavalla. Keskeinen periaate:
// verdiktti (kokonaisarvio) ja yksittäisten mittareiden statukset EI tallenneta
// erikseen, vaan ne LASKETAAN toleranssirajoista (ks. status.ts). Näin näyttö ja
// rajat eivät voi mennä ristiin.
// =============================================================================

// LV-automaatti — modaliteettiagnostinen QA-datamalli (redesign-brief osio 9).
// Verdikti ja statukset JOHDETAAN rajoista (status.ts) — ei tallenneta irrallaan.

// Yhden mittarin tai koko laitteen tila: hyväksytty / varoitus / hylätty / ei dataa.
export type Status = 'pass' | 'warn' | 'fail' | 'nodata'

// Tuetut modaliteetit (TT, röntgen, ultraääni, angiografia).
export type Modality = 'CT' | 'XR' | 'US' | 'ANGIO'

// Yksi trendikäyrän piste: päivä + arvo. idx viittaa takaisin lähdedatan riviin,
// jotta sparklinesta klikatessa löytää oikean mittauksen.
export interface MetricHistoryPoint {
  date: string // ISO-päivä tai näyttömuoto
  value: number
  idx?: number // alkuperäinen indeksi lähdedatassa (mittauksen valintaan)
  status?: Status // valinnainen esilaskettu status pisteelle
}

// Käyrälle lisättävä merkintä (esim. huoltotapahtuma tiettynä päivänä).
export interface MetricAnnotation {
  date: string
  label: string // esim. "Kalibrointi", "Putken vaihto"
}

// Yksi QA-mittari: tunniste, näyttönimi, yksikkö, mitattu arvo, rajat ja historia.
export interface Metric {
  id: string // 'hu_air', 'uniformity', 'mtf50', ...
  label: string // lokalisoitu näyttönimi
  unit: string // 'HU', 'lp/cm', '%', 'mm'
  value: number | null // raakatarkkuus säilytetään
  nominal: number | null
  // Hyväksymisrajat (absoluuttiset). Arvon ollessa näiden ulkopuolella -> fail.
  lowerLimit: number | null
  upperLimit: number | null
  // Toimintaraja (varoitus ennen hylkäystä). Kaksi tapaa:
  //  - actionLimit: symmetrinen poikkeama nominaalista (esim. HU ±20). Brief-osion 9 kenttä.
  //  - lowerWarn/upperWarn: eksplisiittiset varoitusrajat yksipuolisille metriikoille
  //    (esim. MTF: matalampi huonompi -> vain lowerWarn).
  actionLimit?: number
  lowerWarn?: number
  upperWarn?: number
  precision: number // näytön desimaalit
  history: MetricHistoryPoint[]
  annotations?: MetricAnnotation[]
}

// ROI = kiinnostava alue kuvassa (ympyrä tai suorakulmio), joka kytketään mittariin.
export interface ROI {
  metricId: string // kytkee ROI:n metriikkaan (brief 6.5)
  shape: 'circle' | 'rect'
  x: number
  y: number
  r?: number  // ympyrän säde
  w?: number  // suorakulmion leveys
  h?: number  // suorakulmion korkeus
  status?: Status
}

// Yhden laitteen koko QA-tila: perustiedot, kuva ROIneen, mittarit ja verdiktti.
export interface DeviceQA {
  deviceId: string // 'CTAWP73614'
  modality: Modality
  phantom: string // 'CatPhan600'
  manufacturer: string
  model: string
  measuredAt: string // ISO-päivä
  previousAt?: string
  acquisition: Record<string, string | number> // kVp, mAs, leikepaksuus...
  image?: { url: string; rois: ROI[] }
  metrics: Metric[]
  verdict: Status // johdetaan metriikoista (deriveVerdict)
}
