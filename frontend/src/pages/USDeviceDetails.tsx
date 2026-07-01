import { useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer
} from 'recharts'
import { api, type USDataPoint, type USImageResponse } from '../api/client'
import { C, SlackForm, AiChat, MetaRow, MetricPanel, MetricSection, MetricGrid, MetricCell, formatDate } from '../components/DeviceShared'
import { VerdictBar } from '../components/qa/VerdictBar'
import { buildMetrics, formatDay } from '../lib/qa/adapt'
import { hasTolerance } from '../lib/qa/status'

// Tolerance limits (Aljahdali et al. 2021, van Horssen et al. 2017, IPEM 102)
const LIMITS = {
  u_cov:   { warn: 5.0, fail: 10.0 },  // %
  u_skew:  { warn: 0.5, fail: 1.5 },   // absolute
}

function getStatus(value: number | null, metric: string): 'ok' | 'warn' | 'bad' | 'neutral' {
  if (value === null) return 'neutral'
  if (metric === 's_depth') return 'neutral'
  if (metric === 'u_cov') {
    if (value > LIMITS.u_cov.fail) return 'bad'
    if (value > LIMITS.u_cov.warn) return 'warn'
    return 'ok'
  }
  if (metric === 'u_skew') {
    if (Math.abs(value) > LIMITS.u_skew.fail) return 'bad'
    if (Math.abs(value) > LIMITS.u_skew.warn) return 'warn'
    return 'ok'
  }
  return 'neutral'
}

/* Vertikaalinen profiili — kapea palkki kuvan oikealla puolella, täyttää parent-korkeuden */
function VertProfileSVG({ data }: { data: number[] }) {
  if (!data || data.length === 0) return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: C.muted, fontSize: 8, writingMode: 'vertical-rl' }}>Ei profiilia</span>
    </div>
  )
  const W = 56, H = 1000 // viewBox coordinates, SVG stretches to fill parent
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1
  const pts = data.map((v, i) => {
    const y = (i / (data.length - 1)) * H
    const x = W - ((v - min) / range) * (W - 8) - 4
    return `${x},${y}`
  }).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
      style={{ width: '100%', height: '100%', display: 'block' }}>
      <polyline points={pts} fill="none" stroke="#60a5fa" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/* Horisontaalinen profiili — kuvan alla, 5 segmenttiä (full width × 48px) */
function HorizProfileSVG({ data }: { data: number[] }) {
  if (!data || data.length === 0) return (
    <div style={{ height: 48, background: '#020608', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gridColumn: 1 }}>
      <span style={{ color: C.muted, fontSize: 8 }}>Ei profiilia</span>
    </div>
  )
  const W = 400, H = 48
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1
  const norm = (v: number) => 1 - (v - min) / range
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${norm(v) * (H - 8) + 4}`).join(' ')
  const divFracs = [0.1, 0.3, 0.7, 0.9]
  const segFracs = [0, 0.1, 0.3, 0.7, 0.9, 1.0]
  const segMins = segFracs.slice(0, -1).map((start, si) => {
    const end = segFracs[si + 1]
    const s = Math.floor(start * data.length), e = Math.floor(end * data.length)
    const seg = data.slice(s, e)
    if (!seg.length) return null
    const minVal = Math.min(...seg)
    const minIdx = s + seg.indexOf(minVal)
    return { x: (minIdx / (data.length - 1)) * W, y: norm(minVal) * (H - 8) + 4 }
  }).filter(Boolean) as { x: number; y: number }[]

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
      style={{ background: '#020608', borderRadius: 4, display: 'block', gridColumn: 1 }}>
      <polyline points={pts} fill="none" stroke="#60a5fa" strokeWidth="1.5" />
      {divFracs.map((f, i) => <line key={i} x1={f * W} y1={0} x2={f * W} y2={H} stroke="#4b5563" strokeWidth="1" />)}
      {segMins.map((m, i) => <circle key={i} cx={m.x} cy={m.y} r={4} fill={C.bad} />)}
    </svg>
  )
}

function USChart({ data, dataKey, label, unit, warnLine, failLine, color, activeIndex, onClickPoint }: {
  data: USDataPoint[]; dataKey: keyof USDataPoint; label: string; unit: string
  warnLine?: number; failLine?: number; color: string
  activeIndex?: number; onClickPoint?: (index: number) => void
}) {
  const chartData = data.map((d, i) => ({
    date: formatDate(d.study_date ?? ''),
    value: d[dataKey] as number | null,
    _idx: i,
  }))

  const CustomDot = (props: Record<string, unknown>) => {
    const { cx, cy, payload } = props as { cx: number; cy: number; payload: { _idx: number } }
    if (cx == null || cy == null) return null
    const isActive = payload._idx === activeIndex
    return (
      <circle cx={cx} cy={cy} r={isActive ? 6 : 3.5} fill={isActive ? '#fff' : color}
        stroke={color} strokeWidth={isActive ? 2.5 : 1} style={{ cursor: 'pointer' }}
        onClick={() => onClickPoint?.(payload._idx)} />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, outline: 'none' }}>
      <h3 style={{ fontSize: 11, fontWeight: 600, color: C.neutral, margin: 0 }}>{label} [{unit}]</h3>
      <div style={{ flex: 1, minHeight: 0 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 6, right: 12, left: -8, bottom: 0 }}
          style={{ outline: 'none', cursor: 'pointer' }}
          onClick={(st) => {
            if (st && typeof st.activeTooltipIndex === 'number') onClickPoint?.(st.activeTooltipIndex)
          }}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.muted }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10, fill: C.muted }} width={44} />
          <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, fontSize: 11 }}
            labelStyle={{ color: C.neutral }} />
          {warnLine !== undefined && <ReferenceLine y={warnLine} stroke={C.warn} strokeDasharray="4 2"
            label={{ value: 'Tark.', fill: C.warn, fontSize: 10 }} />}
          {failLine !== undefined && <ReferenceLine y={failLine} stroke={C.bad} strokeDasharray="4 2"
            label={{ value: 'Raja', fill: C.bad, fontSize: 10 }} />}
          <Line type="linear" dataKey="value" stroke={color} dot={<CustomDot />}
            activeDot={false} strokeWidth={2.5} connectNulls />
        </LineChart>
      </ResponsiveContainer>
      </div>
    </div>
  )
}

export default function USDeviceDetails() {
  const { station } = useParams<{ station: string }>()
  const s = station ? decodeURIComponent(station) : ''
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)

  const { data: detail } = useQuery<Record<string, unknown>[]>({
    queryKey: ['us', 'device', s], queryFn: () => api.usDeviceDetail(s), enabled: !!s,
  })
  const { data: chartData } = useQuery<USDataPoint[]>({
    queryKey: ['us', 'data', s], queryFn: () => api.usData(s), enabled: !!s,
  })

  // Selected point determines which instance to show
  const selectedPoint = selectedIdx !== null ? chartData?.[selectedIdx] ?? null : null
  const activeInstanceId = selectedPoint?.instance
    ?? (detail?.[0] ? String(detail[0].instance ?? '') : '')

  // Find detail row matching the active instance
  const latest = activeInstanceId
    ? detail?.find(d => String(d.instance) === activeInstanceId) ?? detail?.[0] ?? null
    : detail?.[0] ?? null

  const { data: imageData } = useQuery<USImageResponse>({
    queryKey: ['us', 'image', activeInstanceId],
    queryFn: () => api.usImage(activeInstanceId),
    enabled: !!activeInstanceId, retry: false,
  })

  const handlePointClick = useCallback((idx: number) => {
    setSelectedIdx(prev => prev === idx ? null : idx) // toggle: click again to deselect
  }, [])

  // Check if DB has real profile data (not empty arrays from Go fallback)
  const hasProfiles = !!(imageData?.vert_prof?.length && imageData?.horiz_prof?.length)

  // Use selected point values for chips, or latest from detail
  const chipSDepth = selectedPoint?.s_depth ?? (latest?.s_depth as number | null)
  const chipUCov = selectedPoint?.u_cov ?? (latest?.u_cov as number | null)
  const chipUSkew = selectedPoint?.u_skew ?? (latest?.u_skew as number | null)

  const aiCtx = latest
    ? `Ultraäänilaite: ${latest.stationname ?? s}\ns_depth: ${chipSDepth ?? '?'} cm\nu_cov: ${chipUCov ?? '?'} %\nu_skew: ${chipUSkew ?? '?'}\nAnturityyppi: ${latest.tranducertype ?? '?'}`
    : `Ultraäänilaite: ${s}`

  // Verdikti — config-vetoiset metriikat, vain rajalliset lasketaan mukaan
  const verdictMetrics = buildMetrics('US', latest, (chartData ?? []) as unknown as Record<string, unknown>[]).filter(hasTolerance)
  const verdictDevice = {
    deviceId: String(latest?.stationname ?? s),
    measuredAt: formatDay((latest?.studydate ?? latest?.contentdate) as string | undefined),
    previousAt: formatDay((detail?.[1]?.studydate ?? detail?.[1]?.contentdate) as string | undefined),
  }

  return (
    <div style={{
      position: 'fixed', top: 'var(--navbar-height)', left: 0, right: 0, bottom: 0,
      display: 'grid', gridTemplateColumns: '270px 1fr 300px',
      background: C.bg,
    }}>

      {/* === VASEN PANEELI === */}
      <div style={{
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        borderRight: `1px solid ${C.border}`, background: C.surface,
      }}>
        {/* Panel label */}
        <div className="shrink-0 flex items-center justify-between"
          style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase', color: C.muted }}>
            Laitetiedot
          </span>
          <span style={{ fontSize: 10, fontFamily: 'monospace', padding: '2px 8px', borderRadius: 4,
            background: `${C.accent}26`, color: C.accent, border: `1px solid ${C.accent}4d` }}>US</span>
        </div>

        {/* Image area: grid — col1=image, col2=vert profile; row2=horiz profile under image only */}
        <div style={{
          flexShrink: 0, background: '#000', padding: '3px 6px',
          borderBottom: `1px solid ${C.border}`,
        }}>
          {imageData?.image ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: hasProfiles ? '1fr 40px' : '1fr',
              gridTemplateRows: hasProfiles ? '250px 48px' : '250px',
              gap: 2,
            }}>
              {/* Image: row 1, col 1 */}
              <div style={{ gridRow: 1, gridColumn: 1, background: '#020608', borderRadius: 4, overflow: 'hidden' }}>
                <img src={`data:${imageData.mime ?? 'image/jpeg'};base64,${imageData.image}`}
                  alt="DICOM" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', display: 'block' }} />
              </div>
              {hasProfiles && (
                <>
                  {/* Vertical profile: row 1, col 2 — same height as image */}
                  <div style={{ gridRow: 1, gridColumn: 2, background: '#020608', borderRadius: 4, overflow: 'hidden' }}>
                    <VertProfileSVG data={imageData.vert_prof!} />
                  </div>
                  {/* Horizontal profile: row 2, col 1 only — same width as image */}
                  <div style={{ gridRow: 2, gridColumn: 1 }}>
                    <HorizProfileSVG data={imageData.horiz_prof!} />
                  </div>
                </>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#020608', borderRadius: 4, height: 200 }}>
              <span style={{ color: C.muted, fontSize: 11 }}>{activeInstanceId ? 'Kuva ei saatavilla' : 'Ei instanssia'}</span>
            </div>
          )}
        </div>

        {/* Metadata — scrollable */}
        <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
          {latest && (
            <div>
              <div style={{ padding: '8px 14px 4px', fontSize: 9, fontWeight: 600, letterSpacing: 1.2,
                textTransform: 'uppercase', color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                Metatiedot
              </div>
              <div style={{ padding: '0' }}>
                <MetaRow label="Laite" value={String(latest.stationname ?? '')} />
                <MetaRow label="Instituutio" value={String(latest.institutionname ?? '')} />
                <MetaRow label="Päivämäärä" value={String(latest.studydate ?? latest.contentdate ?? '')} />
                <MetaRow label="Modaliteetti" value="US" />
                <MetaRow label="Valmistaja" value={String(latest.manufacturer ?? '')} />
                <MetaRow label="Malli" value={String(latest.manufacturermodelname ?? '')} />
                <MetaRow label="Sarjanumero" value={String(latest.deviceserialnumber ?? '')} />
                <MetaRow label="Anturityyppi" value={String(latest.tranducertype ?? '')} />
                <MetaRow label="Signaalihäviö" value={latest.u_low ? JSON.stringify(latest.u_low) : '—'} small />
                <MetaRow label="Instance" value={String(latest.instance ?? '').slice(0, 24)} small />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* === KESKIPANEELI — täyttää korkeuden, ei skrollia === */}
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, padding: '12px 16px', gap: 8 }}>
          {/* Breadcrumb */}
          <nav style={{ fontSize: 12, color: C.muted, flexShrink: 0, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <Link to="/" style={{ color: C.muted }}>Aloitus</Link><span>/</span>
            <Link to="/us/institutions" style={{ color: C.muted }}>Instituutiot</Link><span>/</span>
            <Link to="/us/units" style={{ color: C.muted }}>Laitteet</Link><span>/</span>
            <span style={{ color: C.neutral }}>{s}</span>
          </nav>

          {(latest || selectedPoint) && <VerdictBar device={verdictDevice} metrics={verdictMetrics} />}

          {/* Mittarit — yhtenäinen paneeli */}
          {(latest || selectedPoint) && (
            <div style={{ flexShrink: 0 }}>
              <MetricPanel>
                <MetricSection label="Mittarit" first
                  right={selectedPoint ? <span style={{ fontSize: 9, color: C.accent }}>valittu mittaus</span> : undefined} />
                <MetricGrid cols={3}>
                  <MetricCell label="Herkkyys (s_depth)" value={chipSDepth} unit="cm" status={getStatus(chipSDepth, 's_depth')} />
                  <MetricCell label="Tasaisuus (U_cov)" value={chipUCov} unit="%" status={getStatus(chipUCov, 'u_cov')} />
                  <MetricCell label="Epäsymmetria (U_skew)" value={chipUSkew} unit="" status={getStatus(chipUSkew, 'u_skew')} />
                </MetricGrid>
              </MetricPanel>
            </div>
          )}

          {/* Trend charts — täyttävät jäljellä olevan korkeuden */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ fontSize: 12, fontWeight: 600, color: C.neutral, marginBottom: 6, flexShrink: 0 }}>Trendikäyrät</h2>
            {chartData && chartData.length > 0 ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gridAutoRows: 'minmax(0, 1fr)', gap: 4, flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <USChart data={chartData} dataKey="s_depth" label="Herkkyys (s_depth)" unit="cm"
                  color="#60a5fa"
                  activeIndex={selectedIdx ?? undefined} onClickPoint={handlePointClick} />
                <USChart data={chartData} dataKey="u_cov" label="Tasaisuus (U_cov)" unit="%"
                  warnLine={LIMITS.u_cov.warn} failLine={LIMITS.u_cov.fail} color={C.ok}
                  activeIndex={selectedIdx ?? undefined} onClickPoint={handlePointClick} />
                <USChart data={chartData} dataKey="u_skew" label="Epäsymmetria (U_skew)" unit=""
                  warnLine={LIMITS.u_skew.warn} failLine={LIMITS.u_skew.fail} color="#a78bfa"
                  activeIndex={selectedIdx ?? undefined} onClickPoint={handlePointClick} />
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 10, color: C.muted, marginTop: 4, flexShrink: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ display: 'inline-block', width: 20, borderTop: `2px dashed ${C.warn}` }} /> Tarkkailuraja
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ display: 'inline-block', width: 20, borderTop: `2px dashed ${C.bad}` }} /> Toimenpideraja
                  </span>
                </div>
              </>
            ) : (
              <p style={{ fontSize: 12, color: C.muted }}>Ei trendidataa saatavilla.</p>
            )}
          </div>

          {/* Slack */}
          <SlackForm defaultText={
            latest
              ? `Ongelma laitteella ${latest.stationname ?? s} (US)\ns_depth: ${latest.s_depth ?? '?'} cm, u_cov: ${latest.u_cov ?? '?'} %, u_skew: ${latest.u_skew ?? '?'}`
              : `Ongelma US-laitteella: ${s}`
          } />
        </div>
      </div>

      {/* === OIKEA PANEELI — AI === */}
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.surface }}>
        <AiChat context={aiCtx} />
      </div>
    </div>
  )
}
