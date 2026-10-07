// Mittausarvot (QA-metriikat) status-väreillä — sivupaneelin ydinsisältö.
// Näyttää kunkin metriikan nykyarvon + yksikön + hyväksyttävyysrajan, värjättynä
// statuksen mukaan (pass/warn/fail/nodata). Päivittyy kun kaavion piste valitaan
// (metrics rakennetaan valitusta mittauksesta).
import { deriveStatus, fmt, limitText } from '../../lib/qa/status'
import { renderLabel } from '../DeviceShared'
import type { Metric, Status } from '../../lib/qa/types'

const STATUS_COLOR: Record<Status, string> = {
  pass: 'var(--pass)', warn: 'var(--warn)', fail: 'var(--fail)', nodata: 'var(--neutral)',
}

function Row({ m }: { m: Metric }) {
  const st = deriveStatus(m)
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 6, borderLeft: `3px solid ${STATUS_COLOR[st]}`,
      padding: '6px 10px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11.5, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {renderLabel(m.label)}
        </div>
        {limitText(m) !== '—' && (
          <div style={{ fontSize: 9, color: 'var(--text-faint)' }}>limit {limitText(m)}{m.unit ? ' ' + m.unit : ''}</div>
        )}
      </div>
      <div className="num" style={{ fontSize: 14, fontWeight: 600, color: STATUS_COLOR[st], whiteSpace: 'nowrap', flexShrink: 0 }}>
        {fmt(m.value, m.precision)}
        {m.unit && <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 3 }}>{m.unit}</span>}
      </div>
    </div>
  )
}

export function MetricValues({ metrics }: { metrics: Metric[] }) {
  if (!metrics.length) return null
  return (
    <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 9, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.06em', paddingLeft: 2 }}>
        Measured values
      </div>
      {metrics.map((m) => <Row key={m.id} m={m} />)}
    </div>
  )
}
