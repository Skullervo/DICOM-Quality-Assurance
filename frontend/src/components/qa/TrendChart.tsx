// Suurennettu trendikäyrä (yksi metriikka): akselit + toleranssikaista + nominaali +
// rajaviivat, pisteet statusvärillä. Y-akseli ankkuroitu toleranssiin. Klikkaus valitsee
// mittauksen (kuten sparkline).
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, ReferenceLine } from 'recharts'
import { deriveStatus, fmt, fmtDelta } from '../../lib/qa/status'
import { formatDate } from '../DeviceShared'
import type { Metric, Status } from '../../lib/qa/types'

const STATUS_COLOR: Record<Status, string> = {
  pass: 'var(--pass)', warn: 'var(--warn)', fail: 'var(--fail)', nodata: 'var(--neutral)',
}

function DateTooltip(props: Record<string, unknown>) {
  const { active, payload, unit, nominal, precision } = props as {
    active?: boolean
    payload?: { payload: { date: string; value: number } }[]
    unit: string; nominal: number | null; precision: number
  }
  if (!active || !payload || !payload.length) return null
  const p = payload[0].payload
  const d = nominal != null ? p.value - nominal : null
  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 6, padding: '6px 8px', fontSize: 11, color: 'var(--text)' }}>
      <div style={{ color: 'var(--text-muted)' }}>{formatDate(p.date)}</div>
      <div className="num">{fmt(p.value, precision)} {unit}</div>
      {d != null && <div className="num" style={{ color: 'var(--text-faint)' }}>Δ {fmtDelta(d, precision)} {unit}</div>}
    </div>
  )
}

function StatusDot(props: Record<string, unknown>) {
  const { cx, cy, index, payload, status, lastIdx, activeIndex } = props as {
    cx?: number; cy?: number; index?: number; payload?: { idx?: number }
    status: Status; lastIdx: number; activeIndex?: number
  }
  if (cx == null || cy == null) return null
  const isActive = payload?.idx != null && payload.idx === activeIndex
  if (isActive) return <circle cx={cx} cy={cy} r={5} fill="#fff" stroke={STATUS_COLOR[status]} strokeWidth={2} />
  if (index === lastIdx) return <circle cx={cx} cy={cy} r={3.5} fill={STATUS_COLOR[status]} stroke="var(--surface)" strokeWidth={1.5} />
  return <circle cx={cx} cy={cy} r={2.5} fill={STATUS_COLOR[status]} />
}

export function TrendChart({ metric, activeIndex, onSelect }: {
  metric: Metric
  activeIndex?: number
  onSelect?: (index: number) => void
}) {
  const { history, nominal, lowerLimit, upperLimit, unit, precision, label } = metric
  const status = deriveStatus(metric)
  const lastIdx = history.length - 1

  const cand = [nominal, lowerLimit, upperLimit, ...history.map((h) => h.value)].filter(
    (x): x is number => x != null,
  )
  let lo = cand.length ? Math.min(...cand) : 0
  let hi = cand.length ? Math.max(...cand) : 1
  if (lo === hi) { lo -= 1; hi += 1 }
  const pad = (hi - lo) * 0.15
  lo -= pad; hi += pad

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}{unit && <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}> [{unit}]</span>}
      </div>
      <div style={{ height: 132 }}>
        <ResponsiveContainer>
          <LineChart data={history} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}
            style={onSelect ? { cursor: 'pointer' } : undefined}
            onClick={(s) => {
              if (!onSelect) return
              const i = s?.activeTooltipIndex
              if (typeof i === 'number') {
                const idx = history[i]?.idx
                if (idx != null) onSelect(idx)
              }
            }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} interval="preserveStartEnd" tickFormatter={(d) => formatDate(String(d))} />
            <YAxis domain={[lo, hi]} tick={{ fontSize: 9, fill: 'var(--text-muted)' }} width={44} />
            {(lowerLimit != null || upperLimit != null) && (
              <ReferenceArea y1={lowerLimit ?? lo} y2={upperLimit ?? hi} fill="var(--tolerance-band)" strokeOpacity={0} />
            )}
            {nominal != null && <ReferenceLine y={nominal} stroke="var(--nominal-line)" strokeDasharray="3 3" />}
            {upperLimit != null && <ReferenceLine y={upperLimit} stroke="var(--limit-line)" />}
            {lowerLimit != null && <ReferenceLine y={lowerLimit} stroke="var(--limit-line)" />}
            <Tooltip content={<DateTooltip unit={unit} nominal={nominal} precision={precision} />} />
            <Line type="monotone" dataKey="value" stroke="var(--series)" strokeWidth={1.8}
              dot={<StatusDot status={status} lastIdx={lastIdx} activeIndex={activeIndex} />}
              activeDot={false} isAnimationActive={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
