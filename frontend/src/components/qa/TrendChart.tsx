// Suurennettu trendikäyrä (yksi metriikka): akselit + toleranssikaista + nominaali +
// rajaviivat, pisteet statusvärillä. Y-akseli ankkuroitu toleranssiin. Klikkaus valitsee
// mittauksen (kuten sparkline).
import type { ReactNode } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts'
import { deriveStatus, fmt, fmtDelta } from '../../lib/qa/status'
import { formatDate } from '../DeviceShared'
import type { Metric, Status } from '../../lib/qa/types'

const STATUS_COLOR: Record<Status, string> = {
  pass: 'var(--pass)', warn: 'var(--warn)', fail: 'var(--fail)', nodata: 'var(--neutral)',
}

// Renderöi metriikkatokenit (s_depth, U_cov, U_skew) oikeassa muodossa: '_'-merkin
// jälkeinen osa alaindeksinä -> s‹depth›, U‹cov›, U‹skew›. Muut labelit (ei '_') palautuvat
// sellaisenaan.
function renderLabel(label: string) {
  const re = /([A-Za-z])_([A-Za-z]+)/g
  const parts: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(label)) !== null) {
    if (m.index > last) parts.push(label.slice(last, m.index))
    parts.push(<span key={k++}>{m[1]}<sub>{m[2]}</sub></span>)
    last = m.index + m[0].length
  }
  if (last < label.length) parts.push(label.slice(last))
  return parts
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
  const { cx, cy, index, payload, status, lastIdx, activeIndex, onSelect } = props as {
    cx?: number; cy?: number; index?: number; payload?: { idx?: number }
    status: Status; lastIdx: number; activeIndex?: number; onSelect?: (i: number) => void
  }
  if (cx == null || cy == null) return null
  const clickIdx = payload?.idx
  const onClick = onSelect && clickIdx != null ? () => onSelect(clickIdx) : undefined
  const cursor = onSelect ? 'pointer' : undefined
  const isActive = clickIdx != null && clickIdx === activeIndex
  const r = isActive ? 6.5 : index === lastIdx ? 5 : 4
  const fill = isActive ? '#fff' : STATUS_COLOR[status]
  const stroke = isActive ? STATUS_COLOR[status] : 'var(--surface)'
  const sw = isActive ? 2.5 : index === lastIdx ? 1.5 : 1
  return (
    <g>
      {/* Näkymätön isompi klikkausalue -> pisteeseen helpompi osua */}
      {onClick && <circle cx={cx} cy={cy} r={12} fill="transparent" onClick={onClick} style={{ cursor }} />}
      <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={sw}
        onClick={onClick} style={{ cursor }} />
    </g>
  )
}

export function TrendChart({ metric, activeIndex, onSelect, highlighted, onHover, fill, dimTitle }: {
  metric: Metric
  activeIndex?: number
  onSelect?: (index: number) => void
  highlighted?: boolean
  onHover?: (id: string | null) => void
  fill?: boolean // täyttää vanhemman korkeuden (sivutettu näkymä) kiinteän 132px sijaan
  dimTitle?: boolean // himmennä otsikkofontti (ei täysvalkoinen)
}) {
  const { history, nominal, lowerLimit, upperLimit, unit, precision, label } = metric
  const status = deriveStatus(metric)
  const lastIdx = history.length - 1

  const cand = [nominal, lowerLimit, upperLimit, ...history.map((h) => h.value)].filter(
    (x): x is number => x != null,
  )
  let lo = cand.length ? Math.min(...cand) : 0
  let hi = cand.length ? Math.max(...cand) : 1
  if (lo === hi) {
    // Litteä / yksittäinen mittaus: paddaa suhteessa suuruusluokkaan (ei kiinteä ±1,
    // joka näyttää absurdilta isoilla HU-arvoilla)
    const e = Math.max(Math.abs(lo) * 0.05, 1)
    lo -= e; hi += e
  }
  const pad = (hi - lo) * 0.15
  lo -= pad; hi += pad
  // Eksplisiittiset tickit -> ei Recharts-"nice"-algoritmin duplikaatteja/hyppyjä
  const yTicks = [lo, (lo + hi) / 2, hi]

  return (
    <div
      onMouseEnter={onHover ? () => onHover(metric.id) : undefined}
      onMouseLeave={onHover ? () => onHover(null) : undefined}
      style={{
        display: 'flex', flexDirection: 'column', minWidth: 0, borderRadius: 6, padding: 4,
        height: fill ? '100%' : undefined,
        outline: `1px solid ${highlighted ? 'var(--info)' : 'transparent'}`,
        background: highlighted ? 'color-mix(in srgb, var(--info) 9%, transparent)' : 'transparent',
      }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: dimTitle ? 'color-mix(in srgb, var(--text) 72%, transparent)' : 'var(--text)', marginBottom: 2, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {renderLabel(label)}{unit && <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}> [{unit}]</span>}
      </div>
      <div style={fill ? { flex: 1, minHeight: 0 } : { height: 132 }}>
        <ResponsiveContainer>
          <LineChart data={history} margin={{ top: 4, right: 22, left: -12, bottom: 0 }}
            style={onSelect ? { cursor: 'pointer' } : undefined}
            onClick={(s) => {
              if (!onSelect) return
              const st = s as { activeTooltipIndex?: number; activePayload?: { payload?: { idx?: number } }[] }
              const idx = st.activePayload?.[0]?.payload?.idx
                ?? (typeof st.activeTooltipIndex === 'number' ? history[st.activeTooltipIndex]?.idx : undefined)
              if (idx != null) onSelect(idx)
            }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)', fontFamily: 'var(--mono)' }} interval="preserveStartEnd" tickFormatter={(d) => formatDate(String(d))} />
            <YAxis domain={[lo, hi]} ticks={yTicks} tickFormatter={(v) => fmt(Number(v), precision)}
              tick={{ fontSize: 11, fill: 'var(--text-muted)', fontFamily: 'var(--mono)' }} width={60} />
            {nominal != null && <ReferenceLine y={nominal} stroke="var(--nominal-line)" strokeDasharray="3 3" />}
            {upperLimit != null && <ReferenceLine y={upperLimit} stroke="var(--limit-line)" />}
            {lowerLimit != null && <ReferenceLine y={lowerLimit} stroke="var(--limit-line)" />}
            <Tooltip content={<DateTooltip unit={unit} nominal={nominal} precision={precision} />} />
            <Line type="linear" dataKey="value" stroke="var(--series)" strokeWidth={1.8}
              dot={<StatusDot status={status} lastIdx={lastIdx} activeIndex={activeIndex} onSelect={onSelect} />}
              activeDot={false} isAnimationActive={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
