// =============================================================================
// components/qa/MetricValues.tsx — Mitatut QA-arvot status-värein (sivupaneeli)
// =============================================================================
// Listaa kunkin mittarin arvon + yksikön + hyväksyttävyysrajan ja värjää rivin
// reunan statuksen mukaan. Status lasketaan rajoista (deriveStatus). Lista
// päivittyy, kun trendikaaviosta valitaan toinen mittauspiste.
// =============================================================================

// Mittausarvot (QA-metriikat) status-väreillä — sivupaneelin ydinsisältö.
// Näyttää kunkin metriikan nykyarvon + yksikön + hyväksyttävyysrajan, värjättynä
// statuksen mukaan (pass/warn/fail/nodata). Päivittyy kun kaavion piste valitaan
// (metrics rakennetaan valitusta mittauksesta).
import { deriveStatus, fmt, limitText } from '../../lib/qa/status'
import type { Metric, Status } from '../../lib/qa/types'

// Statuksen ja värin kytkentä (värit tulevat teeman CSS-muuttujista).
const STATUS_COLOR: Record<Status, string> = {
  pass: 'var(--pass)', warn: 'var(--warn)', fail: 'var(--fail)', nodata: 'var(--neutral)',
}

// Yhden mittarin rivi: nimi + raja sulkeissa + arvo status-värillä.
function Row({ m }: { m: Metric }) {
  const st = deriveStatus(m)  // laske status rajoista
  // Näytä pelkkä nimi ilman metriikkakoodia "(s_depth)" yms.; raja nimen perässä sulkeissa.
  const name = m.label.replace(/\s*\([^)]*_[^)]*\)\s*$/, '')
  const lim = limitText(m)  // rajan näyttömuoto (esim. "±40" tai "≤ 10")
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 6, borderLeft: `3px solid ${STATUS_COLOR[st]}`,
      padding: '6px 10px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11.5, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}
          {lim !== '' && (
            <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}> ({lim}{m.unit ? ' ' + m.unit : ''})</span>
          )}
        </div>
      </div>
      <div className="num" style={{ fontSize: 14, fontWeight: 600, color: STATUS_COLOR[st], whiteSpace: 'nowrap', flexShrink: 0 }}>
        {fmt(m.value, m.precision)}
        {m.unit && <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 3 }}>{m.unit}</span>}
      </div>
    </div>
  )
}

// Koko lista: otsikko "Measured values" + rivi per mittari.
export function MetricValues({ metrics }: { metrics: Metric[] }) {
  if (!metrics.length) return null  // ei mittareita -> ei näytetä mitään
  return (
    <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 9, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.06em', paddingLeft: 2 }}>
        Measured values
      </div>
      {metrics.map((m) => <Row key={m.id} m={m} />)}
    </div>
  )
}
