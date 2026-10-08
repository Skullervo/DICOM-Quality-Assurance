// Suurennettu trendikäyrä (yksi metriikka): akselit + toleranssikaista + nominaali +
// rajaviivat, pisteet statusvärillä. Y-akseli ankkuroitu toleranssiin. Klikkaus valitsee
// mittauksen (kuten sparkline).
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { deriveStatus, fmt, fmtDelta } from '../../lib/qa/status'
import { formatDate, formatDateAxis, renderLabel } from '../DeviceShared'
import type { Metric, Status } from '../../lib/qa/types'

// Montako mittausta näytetään kerralla; jos historiaa on enemmän, käyrä on vieritettävä.
const WINDOW = 50
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

// Pyöristetty askel ~N jaolle (nice numbers 1/2/2.5/5/10 × 10^k) -> y-akselin
// ala/yläraja + tickit tasalukuina kaikissa kaavioissa.
function niceStep(range: number, divisions: number): number {
  if (!(range > 0) || !isFinite(range)) return 1
  const raw = range / divisions
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10
  return nice * mag
}

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

  // Vieritettävä ikkuna: näytä enintään WINDOW mittausta, oletuksena uusimmat.
  const n = history.length
  const windowed = n > WINDOW
  const maxOffset = Math.max(0, n - WINDOW)
  const [offset, setOffset] = useState(maxOffset)
  const [panOn, setPanOn] = useState(false)
  const touched = useRef(false) // seuraa uusimpia kunnes käyttäjä vierittää itse
  const chartRef = useRef<HTMLDivElement>(null)
  const PAGE = Math.floor(WINDOW / 2)
  const scrollBy = (d: number) => { touched.current = true; setOffset((o) => clamp(o + d, 0, maxOffset)) }

  // Datamäärän muuttuessa (refetch): seuraa uusimpia ellei käyttäjä ole vierittänyt.
  useEffect(() => {
    setOffset((o) => (touched.current ? clamp(o, 0, maxOffset) : maxOffset))
  }, [maxOffset])

  // Skrollaa valittu mittaus näkyviin, jos se jää ikkunan ulkopuolelle.
  useEffect(() => {
    if (!windowed || activeIndex == null) return
    const p = history.findIndex((h) => h.idx === activeIndex)
    if (p < 0) return
    setOffset((o) => (p < o || p >= o + WINDOW ? clamp(p - PAGE, 0, maxOffset) : o))
  }, [activeIndex, windowed, maxOffset, history, PAGE])

  // Pan-tilassa rullaus vierittää ikkunaa (non-passive, jotta sivu ei scrollaa).
  useEffect(() => {
    const el = chartRef.current
    if (!el || !panOn || !windowed) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      touched.current = true
      const dir = (e.deltaY || e.deltaX) > 0 ? 1 : -1
      setOffset((o) => clamp(o + dir * 5, 0, maxOffset))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [panOn, windowed, maxOffset])

  // Pan-tilassa raahaus (hiiri/trackpad) vierittää ikkunaa: paina + liikuta vaakaan.
  const drag = useRef<{ x: number; off: number; pxPerPoint: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => {
    if (!panOn || !windowed) return
    const w = chartRef.current?.clientWidth ?? 1
    drag.current = { x: e.clientX, off: offset, pxPerPoint: Math.max(1, w / WINDOW) }
    touched.current = true
  }
  useEffect(() => {
    if (!panOn || !windowed) return
    const onMove = (e: PointerEvent) => {
      const d = drag.current
      if (!d) return
      const deltaPoints = Math.round((e.clientX - d.x) / d.pxPerPoint)
      setOffset(clamp(d.off - deltaPoints, 0, maxOffset)) // raahaa oikealle -> vanhemmat
    }
    const onUp = () => { drag.current = null }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
  }, [panOn, windowed, maxOffset])

  const data = windowed ? history.slice(offset, offset + WINDOW) : history
  const lastIdx = data.length - 1
  const tickInterval = Math.max(0, Math.ceil(data.length / 8) - 1)
  const shownFrom = windowed ? offset + 1 : 1
  const shownTo = windowed ? offset + data.length : n

  // Y-skaala koko historiasta (pysyy vakaana vieritettäessä, arvot eivät hyppää).
  const cand = [nominal, lowerLimit, upperLimit, ...history.map((h) => h.value)].filter(
    (x): x is number => x != null,
  )
  let dlo = cand.length ? Math.min(...cand) : 0
  let dhi = cand.length ? Math.max(...cand) : 1
  if (dlo === dhi) {
    // Litteä / yksittäinen mittaus: paddaa suhteessa suuruusluokkaan (ei kiinteä ±1,
    // joka näyttää absurdilta isoilla HU-arvoilla)
    const e = Math.max(Math.abs(dlo) * 0.05, 1)
    dlo -= e; dhi += e
  }
  // Pyöristä ääriarvot tasaluvuiksi: ala alas, ylä ylös lähimpään nice-askeleeseen.
  const yStep = niceStep(dhi - dlo, 3)
  const lo = Math.floor(dlo / yStep) * yStep
  const hi = Math.ceil(dhi / yStep) * yStep
  // Eksplisiittiset tickit nice-askeleella -> kaikki pyöreitä, ei Recharts-"nice"-hyppyjä
  const yTicks: number[] = []
  for (let v = lo; v <= hi + yStep * 0.5; v += yStep) yTicks.push(Number(v.toFixed(6)))

  return (
    <div
      ref={chartRef}
      onMouseEnter={onHover ? () => onHover(metric.id) : undefined}
      onMouseLeave={onHover ? () => onHover(null) : undefined}
      onDoubleClick={windowed ? () => setPanOn((p) => !p) : undefined}
      onPointerDown={onPointerDown}
      title={windowed ? 'Double-click to toggle scrolling (drag or wheel the 50-measurement window)' : undefined}
      style={{
        position: 'relative',
        display: 'flex', flexDirection: 'column', minWidth: 0, borderRadius: 6, padding: 4,
        height: fill ? '100%' : undefined,
        cursor: panOn ? 'grab' : undefined,
        touchAction: panOn ? 'none' : undefined,
        userSelect: panOn ? 'none' : undefined,
        outline: `1px solid ${highlighted ? 'var(--info)' : panOn ? 'color-mix(in srgb, var(--info) 55%, transparent)' : 'transparent'}`,
        background: highlighted ? 'color-mix(in srgb, var(--info) 9%, transparent)' : 'transparent',
      }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: dimTitle ? 'color-mix(in srgb, var(--text) 72%, transparent)' : 'var(--text)', marginBottom: 2, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {renderLabel(label)}{unit && <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}> [{unit}]</span>}
      </div>
      {/* Vierityksen ohjaus + alueindikaattori (vain kun historiaa > WINDOW) */}
      {windowed && (
        <div style={{ position: 'absolute', top: 4, right: 6, zIndex: 3, display: 'flex', alignItems: 'center', gap: 3,
          fontSize: 10, fontFamily: 'var(--mono)', color: panOn ? 'var(--info)' : 'var(--text-faint)',
          background: 'color-mix(in srgb, var(--surface) 82%, transparent)', borderRadius: 5, padding: '1px 3px' }}>
          <button onClick={() => scrollBy(-PAGE)} disabled={offset <= 0} aria-label="Older measurements" style={navBtn(offset <= 0)}><ChevronLeft size={13} aria-hidden /></button>
          <span className="tnum">{shownFrom}–{shownTo}/{n}</span>
          <button onClick={() => scrollBy(PAGE)} disabled={offset >= maxOffset} aria-label="Newer measurements" style={navBtn(offset >= maxOffset)}><ChevronRight size={13} aria-hidden /></button>
        </div>
      )}
      {panOn && (
        <div style={{ position: 'absolute', bottom: 6, left: 8, zIndex: 3, fontSize: 10, color: 'var(--info)',
          background: 'color-mix(in srgb, var(--surface) 82%, transparent)', borderRadius: 5, padding: '1px 5px', pointerEvents: 'none' }}>
          drag or wheel · double-click to stop
        </div>
      )}
      <div style={fill ? { flex: 1, minHeight: 0 } : { height: 132 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 4, right: 38, left: -12, bottom: 0 }}
            style={onSelect ? { cursor: panOn ? 'grab' : 'pointer' } : undefined}
            onClick={(s) => {
              if (!onSelect || panOn) return // pan-tilassa klikkaus ei valitse (raahaus etusijalla)
              const st = s as { activeTooltipIndex?: number; activePayload?: { payload?: { idx?: number } }[] }
              const idx = st.activePayload?.[0]?.payload?.idx
                ?? (typeof st.activeTooltipIndex === 'number' ? data[st.activeTooltipIndex]?.idx : undefined)
              if (idx != null) onSelect(idx)
            }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)', fontFamily: 'var(--mono)' }} interval={tickInterval} tickMargin={6} tickFormatter={(d) => formatDateAxis(String(d))} />
            <YAxis domain={[lo, hi]} ticks={yTicks} tickFormatter={(v) => String(Number(Number(v).toFixed(3)))}
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

const navBtn = (disabled: boolean): CSSProperties => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 16,
  borderRadius: 4, border: 'none', background: 'transparent', color: 'inherit', padding: 0,
  cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.35 : 1,
})
