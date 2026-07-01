// Per-modaliteetti metriikkakonfiguraatio (redesign-brief osiot 7 & 9).
// Toleranssit EIVÄT ole kovakoodattuja komponentteihin — ne tulevat täältä.
//
// Alkuarvot on siirretty nykyisistä kovakoodatuista rajoista:
//   - XR: XrayDeviceDetails.tsx `LIMITS`
//   - US: USDeviceDetails.tsx `LIMITS`
//   - CT: CTDeviceDetails.tsx `HU_NOMINAL` + `huStatus` (poikkeama >40 fail, >20 warn)
// Kaikki rajat on tarkistettava fyysikon kanssa (STUK-konteksti voi vaatia
// laitekohtaisia rajoja). Ks. TODO-merkinnät.

import type { Metric, Modality } from './types'

// Metriikan staattinen määrittely (ilman mitattua arvoa / historiaa).
export type MetricConfig = Omit<Metric, 'value' | 'history' | 'annotations'>

// CatPhan HU-lineaarisuuden materiaalit: nominaali repon HU_NOMINAL:sta,
// yhtenäinen tol ±40 / toimintaraja ±20 (repon huStatus). TODO: vahvista
// materiaalikohtaiset rajat fyysikon kanssa.
const HU_TOL = 40
const HU_ACTION = 20
function huMetric(id: string, label: string, nominal: number): MetricConfig {
  return {
    id,
    label,
    unit: 'HU',
    nominal,
    lowerLimit: nominal - HU_TOL,
    upperLimit: nominal + HU_TOL,
    actionLimit: HU_ACTION,
    precision: 0,
  }
}

const CT_METRICS: MetricConfig[] = [
  huMetric('hu_air', 'HU Ilma', -1000),
  huMetric('hu_pmp', 'HU PMP', -196),
  huMetric('hu_ldpe', 'HU LDPE', -104),
  huMetric('hu_poly', 'HU Poly', -35),
  huMetric('hu_acrylic', 'HU Akryyli', 120),
  huMetric('hu_delrin', 'HU Delrin', 340),
  huMetric('hu_teflon', 'HU Teflon', 990),
  // TODO: vahvista fyysikon kanssa — näille ei ole rajoja repossa (nyt vain näyttö).
  { id: 'uniformity_index', label: 'Uniformiteetti', unit: '%', nominal: null, lowerLimit: null, upperLimit: null, precision: 2 },
  { id: 'mtf_50_percent', label: 'MTF 50%', unit: 'lp/cm', nominal: null, lowerLimit: null, upperLimit: null, precision: 2 },
  { id: 'noise_hu_std', label: 'Kohina (HU SD)', unit: 'HU', nominal: null, lowerLimit: null, upperLimit: null, precision: 1 },
  { id: 'slice_thickness_mm', label: 'Viipalepaksuus', unit: 'mm', nominal: null, lowerLimit: null, upperLimit: null, precision: 2 },
]

// XR (NORMI-13) — repon LIMITS. Yksipuolisia: uniformiteettipoikkeama isompi = huonompi,
// MTF/CNR pienempi = huonompi. TODO: vahvista fyysikon kanssa.
const XR_METRICS: MetricConfig[] = [
  { id: 'uniformity_deviation', label: 'Tasaisuus — poikkeama', unit: '%', nominal: 0, lowerLimit: null, upperLimit: 10, upperWarn: 5, precision: 2 },
  { id: 'mtf_50_percent', label: 'MTF 50%', unit: 'lp/mm', nominal: null, lowerLimit: 1.5, upperLimit: null, lowerWarn: 1.8, precision: 2 },
  { id: 'median_cnr', label: 'Mediaani CNR', unit: '', nominal: null, lowerLimit: 2, upperLimit: null, lowerWarn: 3, precision: 2 },
  // TODO: vahvista fyysikon kanssa — ei rajoja repossa.
  { id: 'median_contrast', label: 'Mediaani kontrasti', unit: '', nominal: null, lowerLimit: null, upperLimit: null, precision: 2 },
]

// US (in-air reverberation) — repon LIMITS. s_depth on informatiivinen (ei rajoja),
// u_cov isompi = huonompi, u_skew itseisarvona. TODO: vahvista fyysikon kanssa.
const US_METRICS: MetricConfig[] = [
  { id: 's_depth', label: 'Herkkyys (s_depth)', unit: 'cm', nominal: null, lowerLimit: null, upperLimit: null, precision: 2 },
  { id: 'u_cov', label: 'Tasaisuus (U_cov)', unit: '%', nominal: 0, lowerLimit: null, upperLimit: 10, upperWarn: 5, precision: 2 },
  { id: 'u_skew', label: 'Epäsymmetria (U_skew)', unit: '', nominal: 0, lowerLimit: -1.5, upperLimit: 1.5, lowerWarn: -0.5, upperWarn: 0.5, precision: 2 },
]

export const MODALITY_METRICS: Record<Modality, MetricConfig[]> = {
  CT: CT_METRICS,
  XR: XR_METRICS,
  US: US_METRICS,
}

export function getMetricConfig(modality: Modality, id: string): MetricConfig | undefined {
  return MODALITY_METRICS[modality].find((m) => m.id === id)
}

// Yhdistä staattinen konfiguraatio + mitattu arvo + historia täydeksi Metriciksi.
export function configToMetric(
  cfg: MetricConfig,
  value: number | null,
  history: Metric['history'] = [],
): Metric {
  return { ...cfg, value, history }
}
