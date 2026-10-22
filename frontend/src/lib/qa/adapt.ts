// =============================================================================
// lib/qa/adapt.ts — Muunnos: Go-backendin raakarivit -> yhtenäiset Metric[]
// =============================================================================
// Backend palauttaa mittaukset "löysinä" avain-arvo-riveinä (eri modaliteetit
// käyttävät eri kenttänimiä). Tämä tiedosto muuntaa ne yhtenäiseksi Metric-
// listaksi config.ts:n määrittelyjen mukaan, täyttää uusimman arvon ja rakentaa
// trendihistorian. Tärkeä sopimus: metriikan id === tietokannan kentän nimi.
// =============================================================================

// Adapteri: Go-backendin raakarivit -> config-vetoinen Metric[].
// Metriikan id === DB-kentän nimi (esim. 'hu_air', 'uniformity_deviation', 's_depth').
import type { Metric, Modality } from './types'
import type { Tolerance } from '../../api/client'
import { MODALITY_METRICS, configToMetric } from './config'

// Yksi backend-rivi: kenttänimi -> arvo (tyyppiä ei tiedetä etukäteen).
type Row = Record<string, unknown>

/** Numero tai null (hyväksyy myös numeeriset merkkijonot). */
// Backend voi palauttaa luvun joko numerona tai merkkijonona; tämä yhdenmukaistaa.
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
// Etsii riviltä ensimmäisen löytyvän päivämääräkentän ja palauttaa sen arvon.
function rowDate(row: Row): string {
  for (const f of DATE_FIELDS) {
    const v = row[f]
    if (v != null && String(v).trim() !== '') return String(v)
  }
  return ''  // ei päivämäärää
}

/** Muotoile DICOM-päivä (YYYYMMDD) muotoon DD.MM.YYYY. */
export function formatDay(raw: string | number | null | undefined): string | undefined {
  if (raw == null || String(raw).trim() === '') return undefined
  const s = String(raw).replace(/\D/g, '')  // poista ei-numeeriset merkit
  // Vähintään 8 numeroa -> muotoile; muuten palauta sellaisenaan.
  if (s.length >= 8) return `${s.slice(6, 8)}.${s.slice(4, 6)}.${s.slice(0, 4)}`
  return String(raw)
}

/**
 * Rakenna modaliteetin Metric[]-lista: staattinen konfiguraatio + uusimman rivin
 * arvo + historia trenddatasta. Historia suodattaa pois pisteet joilta arvo puuttuu.
 */
export function buildMetrics(modality: Modality, latest: Row | null, history: Row[] = [], tolerances?: Tolerance[]): Metric[] {
  // DB-toleranssit metriikka-id:llä (vain tämän modaliteetin) — yliajaa config-oletukset
  const tolMap: Record<string, Tolerance> = {}
  if (tolerances) for (const t of tolerances) if (t.modality === modality) tolMap[t.metric_id] = t

  // Käy läpi modaliteetin jokainen metriikkamääritys.
  return MODALITY_METRICS[modality].map((cfgBase) => {
    // Jos tietokannassa on toleranssi tälle metriikalle, se korvaa oletusrajat.
    const t = tolMap[cfgBase.id]
    const cfg = t
      ? {
          ...cfgBase,
          nominal: t.nominal, lowerLimit: t.lower_limit, upperLimit: t.upper_limit,
          actionLimit: t.action_limit ?? undefined, lowerWarn: t.lower_warn ?? undefined, upperWarn: t.upper_warn ?? undefined,
        }
      : cfgBase
    // Uusin mitattu arvo tälle metriikalle (tai null jos ei riviä/arvoa).
    const value = latest ? numOrNull(latest[cfg.id]) : null
    // Säilytä alkuperäinen indeksi (idx) — mittauksen valinta sparklinesta
    const hist: Metric['history'] = history
      .map((pt, idx) => ({ date: rowDate(pt), value: numOrNull(pt[cfg.id]), idx }))
      // Jätä pois pisteet, joilta kyseinen arvo puuttuu (type guard varmistaa value: number).
      .filter((h): h is { date: string; value: number; idx: number } => h.value != null)
    return configToMetric(cfg, value, hist)
  })
}
