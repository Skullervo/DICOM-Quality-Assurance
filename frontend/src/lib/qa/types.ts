// LV-automaatti — modaliteettiagnostinen QA-datamalli (redesign-brief osio 9).
// Verdikti ja statukset JOHDETAAN rajoista (status.ts) — ei tallenneta irrallaan.

export type Status = 'pass' | 'warn' | 'fail' | 'nodata'

export type Modality = 'CT' | 'XR' | 'US'

export interface MetricHistoryPoint {
  date: string // ISO-päivä tai näyttömuoto
  value: number
  idx?: number // alkuperäinen indeksi lähdedatassa (mittauksen valintaan)
  status?: Status // valinnainen esilaskettu status pisteelle
}

export interface MetricAnnotation {
  date: string
  label: string // esim. "Kalibrointi", "Putken vaihto"
}

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

export interface ROI {
  metricId: string // kytkee ROI:n metriikkaan (brief 6.5)
  shape: 'circle' | 'rect'
  x: number
  y: number
  r?: number
  w?: number
  h?: number
  status?: Status
}

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
