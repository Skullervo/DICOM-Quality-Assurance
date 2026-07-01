// Konsolidoitu toleranssitrendi (brief osio 6.3): monta samayksikköistä metriikkaa
// yhdellä "poikkeama nominaalista (Δ)" -akselilla. Toleranssikaista varjostettuna,
// nominaali (0) katkoviivana, y-akseli ankkuroitu toleranssiin. Sarjat erottuvat
// sekä värillä ETTÄ merkkimuodolla (saavutettavuus, ei pelkkä väri).
import { ResponsiveContainer, LineChart, Line, ReferenceArea, ReferenceLine, XAxis, YAxis, Tooltip, Legend } from 'recharts'
import type { Metric } from '../../lib/qa/types'

const COLORS = ['#58A6FF', '#E3893A', '#3FB950', '#D29922', '#a78bfa', '#f472b6', '#22d3ee', '#94a3b8']
type Shape = 'circle' | 'square' | 'triangle' | 'diamond'
const SHAPES: Shape[] = ['circle', 'square', 'triangle', 'diamond']

function ShapeDot(props: Record<string, unknown>) {
  const { cx, cy, shape, color } = props as { cx?: number; cy?: number; shape: Shape; color: string }
  if (cx == null || cy == null) return null
  const r = 4
  if (shape === 'square') return <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} fill={color} />
  if (shape === 'triangle') return <polygon points={`${cx},${cy - r} ${cx + r},${cy + r} ${cx - r},${cy + r}`} fill={color} />
  if (shape === 'diamond') return <polygon points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`} fill={color} />
  return <circle cx={cx} cy={cy} r={r} fill={color} />
}

function DeltaTooltip(props: Record<string, unknown>) {
  const { active, payload, label, unit } = props as {
    active?: boolean
    payload?: { name: string; value: number; color: string }[]
    label?: string; unit: string
  }
  if (!active || !payload || !payload.length) return null
  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 6, padding: '6px 8px', fontSize: 11, color: 'var(--text)' }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      {payload.filter((p) => p.value != null).map((p) => (
        <div key={p.name} className="num" style={{ color: p.color }}>
          {p.name}: {p.value > 0 ? '+' : ''}{p.value} {unit}
        </div>
      ))}
    </div>
  )
}

export function ConsolidatedTrend({ metrics, tol, warn, unit }: {
  metrics: Metric[]
  tol: number // hyväksymisraja (± Δ)
  warn?: number // toimintaraja (± Δ)
  unit: string
}) {
  const withNominal = metrics.filter((m) => m.nominal != null)
  const n = Math.max(0, ...withNominal.map((m) => m.history.length))

  const data = Array.from({ length: n }, (_, i) => {
    const row: Record<string, number | string | null> = {
      date: withNominal.find((m) => m.history[i])?.history[i]?.date ?? '',
    }
    for (const m of withNominal) {
      const h = m.history[i]
      row[m.id] = h && m.nominal != null ? Math.round((h.value - m.nominal) * 100) / 100 : null
    }
    return row
  })

  // Y-akseli ankkuroitu toleranssiin (väh. ±1.5×raja), laajennetaan datan mukaan
  const maxAbs = Math.max(
    tol * 1.5,
    ...data.flatMap((r) => withNominal.map((m) => Math.abs(Number(r[m.id]) || 0))),
  )
  const dom = Math.ceil(maxAbs)

  if (n === 0) return <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Ei trendidataa saatavilla.</p>

  return (
    <div style={{ height: 300 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 6, right: 12, left: -8, bottom: 0 }}>
          <ReferenceArea y1={-tol} y2={tol} fill="var(--tolerance-band)" strokeOpacity={0} />
          {warn != null && <ReferenceArea y1={-warn} y2={warn} fill="var(--tolerance-band)" strokeOpacity={0} />}
          <ReferenceLine y={0} stroke="var(--nominal-line)" strokeDasharray="3 3" />
          <ReferenceLine y={tol} stroke="var(--limit-line)" />
          <ReferenceLine y={-tol} stroke="var(--limit-line)" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} interval="preserveStartEnd" />
          <YAxis domain={[-dom, dom]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} width={44}
            label={{ value: `Δ ${unit}`, angle: -90, position: 'insideLeft', fill: 'var(--text-faint)', fontSize: 10 }} />
          <Tooltip content={<DeltaTooltip unit={unit} />} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {withNominal.map((m, i) => {
            const color = COLORS[i % COLORS.length]
            const shape = SHAPES[i % SHAPES.length]
            return (
              <Line key={m.id} type="linear" dataKey={m.id} name={m.label} stroke={color} strokeWidth={1.6}
                dot={<ShapeDot shape={shape} color={color} />} isAnimationActive={false} connectNulls />
            )
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
