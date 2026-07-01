// Adapteri: Go-backendin raakarivit -> config-vetoinen Metric[].
// Metriikan id === DB-kentän nimi (esim. 'hu_air', 'uniformity_deviation', 's_depth').
import type { Metric, Modality } from './types'
import { MODALITY_METRICS, configToMetric } from './config'

type Row = Record<string, unknown>

/** Numero tai null (hyväksyy myös numeeriset merkkijonot). */
export function numOrNull(v: unknown): number | null {
  if (typeof v === 'number') return Number.isNaN(v) ? null : v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isNaN(n) ? null : n
  }
  return null
}

// Mahdolliset päivämääräkentät (modaliteetit käyttävät eri nimiä).
const DATE_FIELDS = ['study_date', 'content_date', 'studydate', 'contentdate', 'measured_at', 'processed_at']
function rowDate(row: Row): string {
  for (const f of DATE_FIELDS) {
    const v = row[f]
    if (v != null && String(v).trim() !== '') return String(v)
  }
  return ''
}

/** Muotoile DICOM-päivä (YYYYMMDD) muotoon DD.MM.YYYY. */
export function formatDay(raw: string | number | null | undefined): string | undefined {
  if (raw == null || String(raw).trim() === '') return undefined
  const s = String(raw).replace(/\D/g, '')
  if (s.length >= 8) return `${s.slice(6, 8)}.${s.slice(4, 6)}.${s.slice(0, 4)}`
  return String(raw)
}

/**
 * Rakenna modaliteetin Metric[]-lista: staattinen konfiguraatio + uusimman rivin
 * arvo + historia trenddatasta. Historia suodattaa pois pisteet joilta arvo puuttuu.
 */
export function buildMetrics(modality: Modality, latest: Row | null, history: Row[] = []): Metric[] {
  return MODALITY_METRICS[modality].map((cfg) => {
    const value = latest ? numOrNull(latest[cfg.id]) : null
    const hist: Metric['history'] = history
      .map((pt) => ({ date: rowDate(pt), value: numOrNull(pt[cfg.id]) }))
      .filter((h): h is { date: string; value: number } => h.value != null)
    return configToMetric(cfg, value, hist)
  })
}
