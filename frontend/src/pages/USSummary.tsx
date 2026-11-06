// =============================================================================
// pages/USSummary.tsx — Ultraäänen koostenäkymä (/us/summary)
// =============================================================================
// Kokoaa KAIKKI US-mittaukset yhteenvedoksi: ryhmittelee laite+anturi-
// yhdistelmittäin, luokittelee jokaisen mittauksen PASS/WARNING/FAIL ja näyttää
// kustakin ryhmästä mediaaniarvot sekä tulosjakauman. HUOM: tämä sivu käyttää
// omaa kovakoodattua LIMITS-rajataulukkoa (ei DB:n toleransseja) — tarkoitettu
// julkaisua/koontia varten.
// =============================================================================

import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { BreadcrumbNav } from '../components/Breadcrumb'

// Tolerance limits (Aljahdali et al. 2021, van Horssen et al. 2017, IPEM 102)
// Rajat: u_cov (uniformiteetin vaihtelu, %) ja u_skew (epäsymmetria, itseisarvo).
const LIMITS = {
  u_cov:  { warn: 5.0, fail: 10.0 },  // %
  u_skew: { warn: 0.5, fail: 1.5 },   // absolute
}

type QAResult = 'PASS' | 'WARNING' | 'FAIL'

// Luokittelee yhden mittauksen rajojen perusteella. Fail voittaa warnin.
function classify(u_cov: number, u_skew: number): QAResult {
  if (u_cov > LIMITS.u_cov.fail || Math.abs(u_skew) > LIMITS.u_skew.fail) return 'FAIL'
  if (u_cov > LIMITS.u_cov.warn || Math.abs(u_skew) > LIMITS.u_skew.warn) return 'WARNING'
  return 'PASS'
}

// Siistii anturin nimen luettavaan muotoon, esim. "CURVED LINEAR_3500" -> "C (3.5 MHz)".
function cleanProbe(raw: string): string {
  if (!raw) return ''
  const name = raw.replace(/_$/, '')        // poista mahdollinen loppuviiva
  const parts = name.split('_')
  // Odotettu muoto: "<tyyppi>_<taajuus-Hz>".
  if (parts.length === 2 && /^\d+$/.test(parts[1])) {
    const mhz = parseInt(parts[1]) / 1000    // Hz -> MHz
    const ptype = parts[0]
    // Lyhennä yleisimmät anturityypit (C = kaareva, L = lineaari).
    if (ptype === 'CURVED LINEAR' || ptype === 'LINEAR') {
      const short = ptype === 'CURVED LINEAR' ? 'C' : 'L'
      return `${short} (${Number.isInteger(mhz) ? mhz : mhz.toFixed(1)} MHz)`
    }
    return `${ptype} (${Number.isInteger(mhz) ? mhz : mhz.toFixed(1)} MHz)`
  }
  return name
}

// Laskee lukujoukon mediaanin (parillisella määrällä kahden keskimmäisen keskiarvo).
function median(vals: number[]): number {
  if (vals.length === 0) return 0
  const sorted = [...vals].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// Yksi koosterivi: laite+anturi-yhdistelmän tunnistetiedot, määrät ja mediaanit.
interface AggRow {
  manufacturer: string
  model: string
  department: string
  transducer: string
  n: number
  passCount: number
  warnCount: number
  failCount: number
  s_depth: number | null
  u_cov: number | null
  u_skew: number | null
}

export default function USSummary() {
  // Hae kaikkien US-mittausten koostedata backendiltä.
  const { data, isLoading, error } = useQuery({
    queryKey: ['us', 'summary'],
    queryFn: api.usSummary,
  })

  if (isLoading) return <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>Loading...</p>
  if (error) {
    return (
      <div className="status-message status-error">
        <h4>Error loading data</h4>
        <p>{(error as Error).message}</p>
      </div>
    )
  }

  // Group by manufacturer + model + transducer
  // Kerää mittaukset ryhmiin avaimella valmistaja|malli|anturi.
  const groups = new Map<string, {
    mfr: string; model: string; dept: string; probe: string
    sds: number[]; ucs: number[]; uss: number[]  // kerätyt arvot mediaania varten
    pass: number; warn: number; fail: number     // tuloslaskurit
  }>()

  for (const d of (data ?? [])) {
    // Kentät voivat esiintyä eri nimillä -> otetaan ensimmäinen löytyvä.
    const mfr = String(d.device_manufacturer ?? d.manufacturer ?? '')
    const model = String(d.device_model ?? d.stationname ?? '')
    const dept = String(d.institutionaldepartmentname ?? '')
    const probe = cleanProbe(String(d.tranducertype ?? ''))
    const key = `${mfr}|${model}|${probe}`

    // Luo ryhmä ensimmäisellä osumalla.
    if (!groups.has(key)) {
      groups.set(key, { mfr, model, dept, probe, sds: [], ucs: [], uss: [], pass: 0, warn: 0, fail: 0 })
    }
    const g = groups.get(key)!
    const uc = typeof d.u_cov === 'number' ? d.u_cov : null
    const us = typeof d.u_skew === 'number' ? d.u_skew : null
    // Kerää arvot (vain numeeriset) mediaanilaskua varten.
    if (typeof d.s_depth === 'number') g.sds.push(d.s_depth)
    if (uc !== null) g.ucs.push(uc)
    if (us !== null) g.uss.push(us)

    // Luokittele mittaus vain jos molemmat luokitteluarvot löytyvät.
    if (uc !== null && us !== null) {
      const r = classify(uc, us)
      if (r === 'PASS') g.pass++
      else if (r === 'WARNING') g.warn++
      else g.fail++
    }
  }

  // Muunna ryhmät taulukkoriveiksi: mediaanit ja määrät; järjestä nimen mukaan.
  const rows: AggRow[] = Array.from(groups.values()).map(g => ({
    manufacturer: g.mfr,
    model: g.model,
    department: g.dept,
    transducer: g.probe,
    n: Math.max(g.sds.length, g.ucs.length, g.uss.length),
    passCount: g.pass,
    warnCount: g.warn,
    failCount: g.fail,
    s_depth: g.sds.length ? median(g.sds) : null,
    u_cov: g.ucs.length ? median(g.ucs) : null,
    u_skew: g.uss.length ? median(g.uss) : null,
  })).sort((a, b) => a.manufacturer.localeCompare(b.manufacturer) || a.model.localeCompare(b.model) || a.transducer.localeCompare(b.transducer))

  // Kokonaissummat otsikkoyhteenvetoa varten.
  const totalPass = rows.reduce((s, r) => s + r.passCount, 0)
  const totalWarn = rows.reduce((s, r) => s + r.warnCount, 0)
  const totalFail = rows.reduce((s, r) => s + r.failCount, 0)
  const totalMeasurements = (data ?? []).length

  return (
    <>
      <BreadcrumbNav items={[
        { label: 'Home', path: '/' },
        { label: 'Modalities', path: '/modaliteetit' },
        { label: 'Ultrasound Summary' },
      ]} />

      <div className="page-header">
        <h1>In-air Reverberation QA Summary</h1>
        <p>
          {rows.length} device–transducer combinations, {totalMeasurements} measurements
          <br />
          <span style={{ color: 'var(--status-ok)' }}>PASS: {totalPass}</span>
          {' / '}
          <span style={{ color: 'var(--status-warn)' }}>WARNING: {totalWarn}</span>
          {' / '}
          <span style={{ color: 'var(--status-fail)' }}>FAIL: {totalFail}</span>
          {' / '}
          Total: {totalMeasurements}
        </p>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          Limits: U<sub>cov</sub> PASS ≤ 5%, WARNING 5–10%, FAIL &gt; 10% | |U<sub>skew</sub>| PASS ≤ 0.5, WARNING 0.5–1.5, FAIL &gt; 1.5
        </p>
      </div>

      <div className="table-container">
        <table className="modern-table">
          <thead>
            <tr>
              <th>System (US)</th>
              <th>Transducer</th>
              <th style={{ textAlign: 'center' }}>N</th>
              <th style={{ textAlign: 'center', color: 'var(--status-ok)' }}>PASS</th>
              <th style={{ textAlign: 'center', color: 'var(--status-warn)' }}>WARN</th>
              <th style={{ textAlign: 'center', color: 'var(--status-fail)' }}>FAIL</th>
              <th style={{ textAlign: 'right' }}>S<sub>depth</sub> (cm)</th>
              <th style={{ textAlign: 'right' }}>U<sub>cov</sub> (%)</th>
              <th style={{ textAlign: 'right' }}>U<sub>skew</sub></th>
            </tr>
          </thead>
          <tbody>
            {/* Rivi per laite+anturi-ryhmä; u_cov/u_skew-sarakkeet värjätään rajojen mukaan. */}
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.manufacturer}, {r.model}</td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{r.transducer}</td>
                <td style={{ textAlign: 'center' }}>{r.n}</td>
                <td style={{ textAlign: 'center', color: r.passCount > 0 ? 'var(--status-ok)' : 'var(--text-secondary)' }}>
                  {r.passCount}
                </td>
                <td style={{ textAlign: 'center', color: r.warnCount > 0 ? 'var(--status-warn)' : 'var(--text-secondary)' }}>
                  {r.warnCount}
                </td>
                <td style={{ textAlign: 'center', color: r.failCount > 0 ? 'var(--status-fail)' : 'var(--text-secondary)' }}>
                  {r.failCount}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                  {r.s_depth !== null ? r.s_depth.toFixed(2) : ''}
                </td>
                <td style={{
                  textAlign: 'right', fontFamily: 'monospace',
                  color: r.u_cov !== null && r.u_cov > LIMITS.u_cov.fail ? 'var(--status-fail)' : r.u_cov !== null && r.u_cov > LIMITS.u_cov.warn ? 'var(--status-warn)' : undefined,
                }}>
                  {r.u_cov !== null ? r.u_cov.toFixed(2) : ''}
                </td>
                <td style={{
                  textAlign: 'right', fontFamily: 'monospace',
                  color: r.u_skew !== null && Math.abs(r.u_skew) > LIMITS.u_skew.fail ? 'var(--status-fail)' : r.u_skew !== null && Math.abs(r.u_skew) > LIMITS.u_skew.warn ? 'var(--status-warn)' : undefined,
                }}>
                  {r.u_skew !== null ? r.u_skew.toFixed(3) : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
