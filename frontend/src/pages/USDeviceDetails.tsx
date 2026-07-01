import { useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, type USDataPoint, type USImageResponse } from '../api/client'
import { C } from '../components/DeviceShared'
import { VerdictBar } from '../components/qa/VerdictBar'
import { MetricsSection } from '../components/qa/MetricsSection'
import { MainArea } from '../components/qa/MainArea'
import { DeviceInfo } from '../components/qa/DeviceInfo'
import { buildMetrics, formatDay } from '../lib/qa/adapt'
import { hasTolerance } from '../lib/qa/status'

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

  // Config-vetoiset metriikat; verdiktiin vain toleranssilliset
  const metrics = buildMetrics('US', latest, (chartData ?? []) as unknown as Record<string, unknown>[])
  const verdictMetrics = metrics.filter(hasTolerance)
  const verdictDevice = {
    deviceId: String(latest?.stationname ?? s),
    measuredAt: formatDay((latest?.studydate ?? latest?.contentdate) as string | undefined),
    previousAt: formatDay((detail?.[1]?.studydate ?? detail?.[1]?.contentdate) as string | undefined),
  }

  const reportDefault = latest
    ? `Ongelma laitteella ${latest.stationname ?? s} (US)\ns_depth: ${latest.s_depth ?? '?'} cm, u_cov: ${latest.u_cov ?? '?'} %, u_skew: ${latest.u_skew ?? '?'}`
    : `Ongelma US-laitteella: ${s}`

  return (
    <div style={{
      position: 'fixed', top: 'var(--navbar-height)', left: 0, right: 0, bottom: 0,
      display: 'grid', gridTemplateColumns: '300px 1fr',
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

        {/* Laitetiedot — chipit + Lisätiedot */}
        <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
          {latest && (
            <DeviceInfo
              chips={[
                { label: 'Modaliteetti', value: 'US' },
                { label: 'Anturityyppi', value: String(latest.tranducertype ?? '') },
                { label: 'Pvm', value: formatDay((latest.studydate ?? latest.contentdate) as string | undefined) ?? '' },
                { label: 'Sarjanro', value: String(latest.deviceserialnumber ?? '') },
              ]}
              more={[
                { label: 'Laite', value: String(latest.stationname ?? '') },
                { label: 'Instituutio', value: String(latest.institutionname ?? '') },
                { label: 'Valmistaja', value: String(latest.manufacturer ?? '') },
                { label: 'Malli', value: String(latest.manufacturermodelname ?? '') },
                { label: 'Instance', value: String(latest.instance ?? '').slice(0, 24) },
              ]}
            />
          )}
        </div>
      </div>

      {/* PÄÄALUE — välilehdet (Analyysi / Kysy tekoälyltä / Raportoi ongelmasta) */}
      <MainArea
        aiContext={aiCtx}
        reportDefault={reportDefault}
        breadcrumb={
          <nav style={{ fontSize: 12, color: C.muted, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <Link to="/" style={{ color: C.muted }}>Aloitus</Link><span>/</span>
            <Link to="/us/institutions" style={{ color: C.muted }}>Instituutiot</Link><span>/</span>
            <Link to="/us/units" style={{ color: C.muted }}>Laitteet</Link><span>/</span>
            <span style={{ color: C.neutral }}>{s}</span>
          </nav>
        }
      >
        {(latest || selectedPoint) && <VerdictBar device={verdictDevice} metrics={verdictMetrics} />}

        {(latest || selectedPoint) && <MetricsSection metrics={metrics} activeIndex={selectedIdx ?? undefined} onSelect={handlePointClick} />}

      </MainArea>
    </div>
  )
}
