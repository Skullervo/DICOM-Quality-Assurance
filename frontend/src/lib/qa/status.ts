// Status- ja toleranssilogiikka (redesign-brief osio 7). Puhtaita funktioita, ei UI:ta.
import type { Metric, Status } from './types'

// Osajoukko Metricistä jota status tarvitsee (helpottaa testausta).
export type StatusInput = Pick<
  Metric,
  'value' | 'nominal' | 'lowerLimit' | 'upperLimit' | 'actionLimit' | 'lowerWarn' | 'upperWarn'
> & { precision?: number }

/**
 * Johda metriikan status rajoista:
 *  - ei arvoa                              -> 'nodata'
 *  - arvo hyväksymisrajojen ulkopuolella   -> 'fail'
 *  - toimintarajan yli (rajojen sisällä)    -> 'warn'
 *  - muuten                                -> 'pass'
 *
 * Toimintaraja voi olla symmetrinen (actionLimit, poikkeama nominaalista) tai
 * yksipuolinen (lowerWarn/upperWarn) — kaikki tarkistetaan.
 */
export function deriveStatus(m: StatusInput): Status {
  if (m.value == null || Number.isNaN(m.value)) return 'nodata'
  // Luokittele NÄYTETYLLÄ tarkkuudella -> samalta näyttävät arvot saavat saman statuksen/värin.
  const v = m.precision != null ? Number(m.value.toFixed(m.precision)) : m.value

  // Hyväksymisrajat (fail)
  if (m.lowerLimit != null && v < m.lowerLimit) return 'fail'
  if (m.upperLimit != null && v > m.upperLimit) return 'fail'

  // Toimintaraja (warn)
  if (m.actionLimit != null && m.nominal != null && Math.abs(v - m.nominal) > m.actionLimit) return 'warn'
  if (m.lowerWarn != null && v < m.lowerWarn) return 'warn'
  if (m.upperWarn != null && v > m.upperWarn) return 'warn'

  return 'pass'
}

/** Onko metriikalle määritelty jokin toleranssi (muuten sitä ei voi arvioida). */
export function hasTolerance(m: StatusInput): boolean {
  return (
    m.lowerLimit != null ||
    m.upperLimit != null ||
    m.actionLimit != null ||
    m.lowerWarn != null ||
    m.upperWarn != null
  )
}

export interface VerdictSummary {
  verdict: Status
  measured: number // pass + warn + fail
  pass: number
  warn: number
  fail: number
  nodata: number
}

/** Konsolidoi verdikti: korkein vakavuus voittaa (Carbon). */
export function deriveVerdict(metrics: StatusInput[]): VerdictSummary {
  const statuses = metrics.map(deriveStatus)
  const count = (x: Status) => statuses.filter((s) => s === x).length
  const pass = count('pass')
  const warn = count('warn')
  const fail = count('fail')
  const nodata = count('nodata')
  const measured = pass + warn + fail
  const verdict: Status = fail > 0 ? 'fail' : warn > 0 ? 'warn' : measured > 0 ? 'pass' : 'nodata'
  return { verdict, measured, pass, warn, fail, nodata }
}

/**
 * Rakenna symmetriset rajat nominaali ± toleranssi -mallista
 * (helpottaa nykyisten kovakoodattujen rajojen siirtoa konfiguraatioon).
 */
export function symmetricLimits(
  nominal: number,
  tol: number,
  actionTol?: number,
): Pick<Metric, 'nominal' | 'lowerLimit' | 'upperLimit' | 'actionLimit'> {
  return {
    nominal,
    lowerLimit: nominal - tol,
    upperLimit: nominal + tol,
    ...(actionTol != null ? { actionLimit: actionTol } : {}),
  }
}

// ===== Format-apurit — pyöristä AINA näytettävä luku, säilytä raakatarkkuus datassa =====
const MINUS = '−' // typografinen miinus (rivittyy tabulaarisesti)

export function fmt(v: number | null | undefined, precision: number): string {
  if (v == null || Number.isNaN(v)) return '—'
  return v.toFixed(precision).replace('-', MINUS)
}

export function fmtDelta(d: number | null | undefined, precision: number): string {
  if (d == null || Number.isNaN(d)) return '—'
  const sign = d > 0 ? '+' : d < 0 ? MINUS : '±'
  return sign + Math.abs(d).toFixed(precision)
}

export type FailingItem = { label: string; value: string; status: 'warn' | 'fail'; limit: string }

/** Rajojen ulkopuolella (warn/fail) olevat mittarit rakenteisesti raporttiin. */
export function failingDetails(metrics: Metric[]): FailingItem[] {
  return metrics
    .filter((m) => m.value != null && hasTolerance(m) && deriveStatus(m) !== 'pass')
    .map((m) => ({
      label: m.label,
      value: `${fmt(m.value!, m.precision)}${m.unit ? ' ' + m.unit : ''}`,
      status: deriveStatus(m) === 'fail' ? 'fail' : 'warn',
      limit: limitText(m),
    }))
}

/** Rajan näyttömuoto: "±40", "1.5…10", "≤ 10", "≥ 1.5" tai "—". */
export function limitText(m: Pick<Metric, 'lowerLimit' | 'upperLimit' | 'nominal' | 'precision'>): string {
  const p = m.precision
  const { lowerLimit: lo, upperLimit: hi, nominal: nom } = m
  if (nom != null && lo != null && hi != null && Math.abs(hi - nom - (nom - lo)) < 1e-9) return `±${fmt(hi - nom, p)}`
  if (lo != null && hi != null) return `${fmt(lo, p)}…${fmt(hi, p)}`
  if (hi != null) return `≤ ${fmt(hi, p)}`
  if (lo != null) return `≥ ${fmt(lo, p)}`
  return '—'
}
