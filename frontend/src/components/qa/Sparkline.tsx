// Sparkline: pieni historiakäyrä toleranssikaistalla + nominaali + rajaviivat
// (brief osiot 6.2/6.3). Y-akseli ankkuroidaan toleranssiin, ei autozoomata kohinaan.
import { ResponsiveContainer, LineChart, Line, ReferenceArea, ReferenceLine, YAxis, XAxis, Tooltip } from 'recharts'
import { deriveStatus, fmt, fmtDelta } from '../../lib/qa/status'
import type { Metric, Status } from '../../lib/qa/types'

const STATUS_COLOR: Record<Status, string> = {
  pass: 'var(--pass)', warn: 'var(--warn)', fail: 'var(--fail)', nodata: 'var(--neutral)',
}

// Piste: aktiivinen (valittu) korostuu; muuten viimeinen piste statusvärillä. Recharts
// kloonaa elementin lisäten cx/cy/index/payload — omat propit (activeIndex/status/lastIdx)
// säilyvät. Moduulitasolla (ei luoda renderissä).
function StatusDot(props: Record<string, unknown>) {
  const { cx, cy, index, payload, activeIndex, status, lastIdx } = props as {
    cx?: number; cy?: number; index?: number; payload?: { idx?: number }
    activeIndex?: number; status: Status; lastIdx: number
  }
  if (cx == null || cy == null) return null
  const isActive = payload?.idx != null && payload.idx === activeIndex
  if (isActive) return <circle cx={cx} cy={cy} r={4.5} fill="#fff" stroke={STATUS_COLOR[status]} strokeWidth={2} />
  if (index === lastIdx) return <circle cx={cx} cy={cy} r={3.2} fill={STATUS_COLOR[status]} stroke="var(--surface)" strokeWidth={1.5} />
  return <circle cx={cx} cy={cy} r={2} fill={STATUS_COLOR[status]} />
}

function SparkTooltip(props: Record<string, unknown>) {
  const { active, payload, unit, nominal, precision } = props as {
    active?: boolean
    payload?: { payload: { date: string; value: number } }[]
    unit: string; nominal: number | null; precision: number
  }
  if (!active || !payload || !payload.length) return null
  const p = payload[0].payload
  const d = nominal != null ? p.value - nominal : null
  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 6, padding: '6px 8px', fontSize: 12, color: 'var(--text)' }}>
      <div style={{ color: 'var(--text-muted)' }}>{p.date}</div>
      <div className="num">{fmt(p.value, precision)} {unit}</div>
      {d != null && <div className="num" style={{ color: 'var(--text-faint)' }}>Δ {fmtDelta(d, precision)} {unit}</div>}
    </div>
  )
}

export function Sparkline({ metric, activeIndex, onSelect, height = 52 }: {
  metric: Metric
  activeIndex?: number // valittu mittaus (alkuperäinen idx)
  onSelect?: (index: number) => void
  height?: number
}) {
  const { history, nominal, lowerLimit, upperLimit, unit, precision } = metric
  const status = deriveStatus(metric)
  const lastIdx = history.length - 1

  // Domain ankkuroidaan rajoihin + dataan (ei pelkkään kohinaan).
  const cand = [nominal, lowerLimit, upperLimit, ...history.map((h) => h.value)].filter(
    (x): x is number => x != null,
  )
  let lo = Math.min(...cand)
  let hi = Math.max(...cand)
  if (lo === hi) { lo -= 1; hi += 1 }
  const pad = (hi - lo) * 0.15
  lo -= pad; hi += pad

  return (
    <div style={{ height, width: '100%' }}>
      <ResponsiveContainer>
        <LineChart data={history} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}
          style={onSelect ? { cursor: 'pointer' } : undefined}
          onClick={(s) => {
            if (!onSelect) return
            const i = s?.activeTooltipIndex
            if (typeof i === 'number') {
              const idx = history[i]?.idx
              if (idx != null) onSelect(idx)
            }
          }}>
          <YAxis hide domain={[lo, hi]} />
          <XAxis hide dataKey="date" />
          {(lowerLimit != null || upperLimit != null) && (
            <ReferenceArea y1={lowerLimit ?? lo} y2={upperLimit ?? hi} fill="var(--tolerance-band)" strokeOpacity={0} />
          )}
          {nominal != null && <ReferenceLine y={nominal} stroke="var(--nominal-line)" strokeDasharray="3 3" strokeWidth={1} />}
          {upperLimit != null && <ReferenceLine y={upperLimit} stroke="var(--limit-line)" strokeWidth={1} />}
          {lowerLimit != null && <ReferenceLine y={lowerLimit} stroke="var(--limit-line)" strokeWidth={1} />}
          <Tooltip content={<SparkTooltip unit={unit} nominal={nominal} precision={precision} />} cursor={{ stroke: 'var(--border-strong)' }} />
          <Line type="monotone" dataKey="value" stroke="var(--series)" strokeWidth={1.6}
            dot={<StatusDot activeIndex={activeIndex} status={status} lastIdx={lastIdx} />} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
