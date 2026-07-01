import { useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer
} from 'recharts'
import { api, type ImageResponse } from '../api/client'
import { C, SlackForm, AiChat, MetaRow, MetricPanel, MetricSection, MetricGrid, MetricCell, formatDate } from '../components/DeviceShared'

const LIMITS = {
  uniformity_deviation: { warn: 5, fail: 10 },
  median_cnr:           { warn: 3, fail: 2 },
  mtf_50_percent:       { warn: 1.8, fail: 1.5 },
}

function getStatus(value: number | null, metric: string): 'ok' | 'warn' | 'bad' | 'neutral' {
  if (typeof value !== 'number') return 'neutral'
  if (metric === 'uniformity_deviation')
    return value > LIMITS.uniformity_deviation.fail ? 'bad' : value > LIMITS.uniformity_deviation.warn ? 'warn' : 'ok'
  if (metric === 'mtf_50_percent')
    return value < LIMITS.mtf_50_percent.fail ? 'bad' : value < LIMITS.mtf_50_percent.warn ? 'warn' : 'ok'
  if (metric === 'median_cnr')
    return value < LIMITS.median_cnr.fail ? 'bad' : value < LIMITS.median_cnr.warn ? 'warn' : 'ok'
  return 'ok'
}

const IMAGE_TABS = [
  { key: 'dicom', label: 'DICOM' },
  { key: 'contrast_rois', label: 'ROI-kartta' },
  { key: 'mtf_lp', label: 'Viivapari' },
  { key: 'mtf_curve', label: 'MTF-käyrä' },
]

type ChartDef = { dataKey: string; label: string; unit: string; color: string; warn?: number; fail?: number }

// 19 metriikkaa ryhmitelty kolmeen välilehteen -> ~4-8 käyrää kerrallaan, ei 19
const CHART_GROUPS: { key: string; label: string; charts: ChartDef[] }[] = [
  { key: 'summary', label: 'Yhteenveto', charts: [
    { dataKey: 'uniformity_deviation', label: 'Tasaisuus — poikkeama', unit: '%', color: '#93c5fd', warn: LIMITS.uniformity_deviation.warn, fail: LIMITS.uniformity_deviation.fail },
    { dataKey: 'mtf_50_percent', label: 'MTF 50%', unit: 'lp/mm', color: '#a78bfa', warn: LIMITS.mtf_50_percent.warn, fail: LIMITS.mtf_50_percent.fail },
    { dataKey: 'median_cnr', label: 'Mediaani CNR', unit: '', color: '#6ee7b7', warn: LIMITS.median_cnr.warn, fail: LIMITS.median_cnr.fail },
    { dataKey: 'median_contrast', label: 'Mediaani kontrasti', unit: '', color: '#52e3a0' },
    { dataKey: 'uniformity_center', label: 'Tasaisuus — keskialue', unit: '', color: '#60a5fa' },
    { dataKey: 'num_contrast_rois_seen', label: 'Kontrasti-ROI (kpl)', unit: '', color: '#f59e0b' },
  ] },
  { key: 'cu', label: 'Cu-kiila', charts: [
    { dataKey: 'cu_000_mean', label: 'Cu 0.0 mm', unit: '', color: '#fb923c' },
    { dataKey: 'cu_030_mean', label: 'Cu 0.3 mm', unit: '', color: '#fbbf24' },
    { dataKey: 'cu_065_mean', label: 'Cu 0.65 mm', unit: '', color: '#facc15' },
    { dataKey: 'cu_100_mean', label: 'Cu 1.0 mm', unit: '', color: '#a3e635' },
    { dataKey: 'cu_140_mean', label: 'Cu 1.4 mm', unit: '', color: '#4ade80' },
    { dataKey: 'cu_185_mean', label: 'Cu 1.85 mm', unit: '', color: '#2dd4bf' },
    { dataKey: 'cu_230_mean', label: 'Cu 2.3 mm', unit: '', color: '#22d3ee' },
  ] },
  { key: 'lc', label: 'Matala kontrasti', charts: [
    { dataKey: 'lc_08_contrast', label: 'Matala k. 0.8 %', unit: '', color: '#818cf8' },
    { dataKey: 'lc_12_contrast', label: 'Matala k. 1.2 %', unit: '', color: '#a78bfa' },
    { dataKey: 'lc_20_contrast', label: 'Matala k. 2.0 %', unit: '', color: '#c084fc' },
    { dataKey: 'lc_28_contrast', label: 'Matala k. 2.8 %', unit: '', color: '#e879f9' },
    { dataKey: 'lc_40_contrast', label: 'Matala k. 4.0 %', unit: '', color: '#f472b6' },
    { dataKey: 'lc_56_contrast', label: 'Matala k. 5.6 %', unit: '', color: '#fb7185' },
  ] },
]

function XRChart({ data, def, activeIndex, onClickPoint }: {
  data: Record<string, unknown>[]; def: ChartDef
  activeIndex?: number; onClickPoint?: (i: number) => void
}) {
  const chartData = data.map((d, i) => ({
    date: formatDate(String(d.study_date ?? '')),
    value: d[def.dataKey] as number | null,
    _idx: i,
  }))
  if (chartData.every(d => typeof d.value !== 'number')) return null

  const CustomDot = (props: Record<string, unknown>) => {
    const { cx, cy, payload } = props as { cx: number; cy: number; payload: { _idx: number } }
    if (cx == null || cy == null) return null
    const active = payload._idx === activeIndex
    return <circle cx={cx} cy={cy} r={active ? 5.5 : 3} fill={active ? '#fff' : def.color}
      stroke={def.color} strokeWidth={active ? 2.5 : 1} style={{ cursor: 'pointer' }}
      onClick={() => onClickPoint?.(payload._idx)} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
      <h3 className="text-[11px] font-medium" style={{ color: C.neutral, margin: 0 }}>
        {def.label}{def.unit && <span style={{ color: C.muted }}> [{def.unit}]</span>}
      </h3>
      <div style={{ flex: 1, minHeight: 0 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 4, right: 10, left: -10, bottom: 0 }}
          style={{ cursor: 'pointer' }}
          onClick={(s) => {
            if (s && typeof s.activeTooltipIndex === 'number') onClickPoint?.(s.activeTooltipIndex)
          }}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
          <XAxis dataKey="date" tick={{ fontSize: 9, fill: C.muted }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 9, fill: C.muted }} width={44} />
          <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, fontSize: 11 }}
            labelStyle={{ color: C.neutral }} />
          {def.warn !== undefined && <ReferenceLine y={def.warn} stroke={C.warn} strokeDasharray="4 2" />}
          {def.fail !== undefined && <ReferenceLine y={def.fail} stroke={C.bad} strokeDasharray="4 2" />}
          <Line type="linear" dataKey="value" stroke={def.color} dot={<CustomDot />}
            activeDot={false} strokeWidth={2} connectNulls />
        </LineChart>
      </ResponsiveContainer>
      </div>
    </div>
  )
}

export default function XrayDeviceDetails() {
  const { inst, unit } = useParams<{ inst: string; unit: string }>()
  const dInst = inst ? decodeURIComponent(inst) : ''
  const dUnit = unit ? decodeURIComponent(unit) : ''
  const [imgTab, setImgTab] = useState('dicom')
  const [group, setGroup] = useState('summary')
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)

  const { data: detail } = useQuery<Record<string, unknown>[]>({
    queryKey: ['xray', 'device', dInst, dUnit],
    queryFn: () => api.xrayDeviceDetail(dInst, dUnit), enabled: !!(dInst && dUnit),
  })
  const { data: chartData } = useQuery<Record<string, unknown>[]>({
    queryKey: ['xray', 'data', dUnit],
    queryFn: () => api.xrayData(dUnit), enabled: !!dUnit,
  })

  // Selected trend point -> which instance/measurement to show
  const selectedPoint = selectedIdx !== null ? chartData?.[selectedIdx] ?? null : null
  const activeInstanceId = (selectedPoint?.instance as string | undefined)
    ?? (detail?.[0] ? String(detail[0].instance ?? '') : '')
  const latest = activeInstanceId
    ? detail?.find(d => String(d.instance) === activeInstanceId) ?? detail?.[0] ?? null
    : detail?.[0] ?? null

  const { data: dicomImg } = useQuery<ImageResponse>({
    queryKey: ['xray', 'image', activeInstanceId],
    queryFn: () => api.xrayImage(activeInstanceId),
    enabled: !!activeInstanceId && imgTab === 'dicom', retry: false,
  })
  const analysisUrl = activeInstanceId && imgTab !== 'dicom'
    ? api.xrayAnalysisImageUrl(activeInstanceId, imgTab) : null

  const handlePointClick = useCallback((idx: number) => {
    setSelectedIdx(prev => prev === idx ? null : idx)
  }, [])

  // Chip-arvot: valittu piste tai uusin
  const num = (v: unknown) => (typeof v === 'number' ? v : null)
  const chipUnif = num(selectedPoint?.uniformity_deviation ?? latest?.uniformity_deviation)
  const chipMtf = num(selectedPoint?.mtf_50_percent ?? latest?.mtf_50_percent)
  const chipCnr = num(selectedPoint?.median_cnr ?? latest?.median_cnr)
  const chipContrast = num(selectedPoint?.median_contrast ?? latest?.median_contrast)
  const chipCu100 = num(selectedPoint?.cu_100_mean ?? latest?.cu_100_mean)
  const chipRois = num(selectedPoint?.num_contrast_rois_seen ?? latest?.num_contrast_rois_seen)

  const aiCtx = latest
    ? `Röntgenlaite: ${latest.station_name ?? dUnit}\nkVp: ${latest.kvp ?? '?'}, mAs: ${latest.exposure_mAs ?? '?'}\nUniformity: ${chipUnif ?? '?'} %\nMTF 50%: ${chipMtf ?? '?'} lp/mm\nCNR: ${chipCnr ?? '?'}`
    : `Röntgenlaite: ${dUnit}`

  const activeCharts = CHART_GROUPS.find(g => g.key === group)?.charts ?? []

  return (
    <div style={{
      position: 'fixed', top: 'var(--navbar-height)', left: 0, right: 0, bottom: 0,
      display: 'grid', gridTemplateColumns: '270px 1fr 300px', background: C.bg,
    }}>

      {/* === VASEN PANEELI === */}
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden',
        borderRight: `1px solid ${C.border}`, background: C.surface }}>
        <div className="shrink-0 flex items-center justify-between"
          style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase', color: C.muted }}>Laitetiedot</span>
          <span style={{ fontSize: 10, fontFamily: 'monospace', padding: '2px 8px', borderRadius: 4,
            background: 'rgba(96,165,250,0.15)', color: '#93c5fd', border: '1px solid rgba(96,165,250,0.3)' }}>XR</span>
        </div>

        {/* Kuva + kuvavälilehdet */}
        {activeInstanceId && (
          <div style={{ flexShrink: 0, padding: '8px 10px', borderBottom: `1px solid ${C.border}` }}>
            <div className="flex gap-0.5 mb-2">
              {IMAGE_TABS.map(t => (
                <button key={t.key} onClick={() => setImgTab(t.key)}
                  className="px-1.5 py-0.5 text-[9px] rounded transition"
                  style={{ background: imgTab === t.key ? C.surface2 : 'transparent',
                    color: imgTab === t.key ? C.accent : C.muted,
                    borderBottom: imgTab === t.key ? `2px solid ${C.accent}` : '2px solid transparent' }}>
                  {t.label}
                </button>
              ))}
            </div>
            <div style={{ background: '#000', borderRadius: 6, aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {imgTab === 'dicom' ? (
                dicomImg?.image
                  ? <img src={`data:${dicomImg.mime ?? 'image/jpeg'};base64,${dicomImg.image}`} alt="DICOM"
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  : <span className="text-[10px]" style={{ color: C.muted }}>Kuva ei saatavilla</span>
              ) : analysisUrl ? (
                <img src={analysisUrl} alt={imgTab} style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
              ) : null}
            </div>
          </div>
        )}

        {/* Metatiedot */}
        <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
          {latest && (
            <div>
              <div style={{ padding: '8px 14px 4px', fontSize: 9, fontWeight: 600, letterSpacing: 1.2,
                textTransform: 'uppercase', color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                Metatiedot
              </div>
              <MetaRow label="Laite" value={String(latest.station_name ?? '')} />
              <MetaRow label="Instituutio" value={String(latest.institution_name ?? '')} />
              <MetaRow label="Päivämäärä" value={String(latest.content_date ?? '').slice(0, 10)} />
              <MetaRow label="Valmistaja" value={String(latest.manufacturer ?? '')} />
              <MetaRow label="Malli" value={String(latest.manufacturer_model_name ?? '')} />
              <MetaRow label="kVp" value={String(latest.kvp ?? '—')} />
              <MetaRow label="Valotus (mAs)" value={String(latest.exposure_mAs ?? '—')} />
            </div>
          )}
        </div>
      </div>

      {/* === KESKIPANEELI — täyttää korkeuden, ei skrollia === */}
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, padding: '12px 16px', gap: 8 }}>
          <nav className="text-[12px] flex gap-1 flex-wrap" style={{ color: C.muted, flexShrink: 0 }}>
            <Link to="/" className="hover:text-white">Aloitus</Link><span>/</span>
            <Link to="/xray/institutions" className="hover:text-white">Röntgen</Link><span>/</span>
            <Link to={`/xray/units?institution=${encodeURIComponent(dInst)}`} className="hover:text-white">{dInst}</Link><span>/</span>
            <span style={{ color: C.neutral }}>{dUnit}</span>
            {selectedPoint && <span style={{ color: C.accent }}>· valittu mittaus {formatDate(String(selectedPoint.study_date ?? ''))}</span>}
          </nav>

          {/* Mittarit — yhtenäinen paneeli */}
          {latest && (
            <div style={{ flexShrink: 0 }}>
              <MetricPanel>
                <MetricSection label="Mittarit" first
                  right={selectedPoint ? <span style={{ fontSize: 9, color: C.accent }}>valittu mittaus</span> : undefined} />
                <MetricGrid cols={6}>
                  <MetricCell label="Tasaisuus" value={chipUnif} unit="%" status={getStatus(chipUnif, 'uniformity_deviation')} />
                  <MetricCell label="MTF 50%" value={chipMtf} unit="lp/mm" status={getStatus(chipMtf, 'mtf_50_percent')} />
                  <MetricCell label="Mediaani CNR" value={chipCnr} unit="" status={getStatus(chipCnr, 'median_cnr')} />
                  <MetricCell label="Mediaani kontrasti" value={chipContrast} unit="" status="ok" />
                  <MetricCell label="Cu 1.0mm" value={chipCu100} unit="" status="ok" />
                  <MetricCell label="Kontrasti-ROI" value={chipRois} unit="" status="ok" decimals={0} />
                </MetricGrid>
              </MetricPanel>
            </div>
          )}

          {/* Trendit — ryhmävälilehdet, täyttävät jäljellä olevan korkeuden */}
          <div className="rounded-md" style={{ background: C.surface, border: `1px solid ${C.border}`, padding: 10, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2" style={{ flexShrink: 0 }}>
              <h2 className="text-[12px] font-semibold" style={{ color: C.neutral }}>Trendikäyrät — NORMI-13</h2>
              <div className="flex gap-1">
                {CHART_GROUPS.map(g => (
                  <button key={g.key} onClick={() => setGroup(g.key)}
                    className="px-2 py-0.5 text-[10px] rounded transition"
                    style={{ background: group === g.key ? C.accent : C.surface2,
                      color: group === g.key ? '#fff' : C.muted,
                      border: `1px solid ${group === g.key ? C.accent : C.border}` }}>
                    {g.label} ({g.charts.length})
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[10px] mb-2" style={{ color: C.muted, flexShrink: 0 }}>
              Vihje: klikkaa käyrän pistettä nähdäksesi kyseisen mittauksen kuvan ja arvot.
            </p>
            {chartData && chartData.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gridAutoRows: 'minmax(0, 1fr)', gap: '4px 16px', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                {activeCharts.map(def => (
                  <XRChart key={def.dataKey} data={chartData} def={def}
                    activeIndex={selectedIdx ?? undefined} onClickPoint={handlePointClick} />
                ))}
              </div>
            ) : (
              <p className="text-[11px]" style={{ color: C.muted }}>Ei trendidataa saatavilla.</p>
            )}
            <div style={{ display: 'flex', gap: 16, fontSize: 10, color: C.muted, marginTop: 4, flexShrink: 0 }}>
              <span className="flex items-center gap-1"><span style={{ display: 'inline-block', width: 20, borderTop: `2px dashed ${C.warn}` }} /> Tarkkailuraja</span>
              <span className="flex items-center gap-1"><span style={{ display: 'inline-block', width: 20, borderTop: `2px dashed ${C.bad}` }} /> Toimenpideraja</span>
            </div>
          </div>

          <SlackForm defaultText={
            latest
              ? `Ongelma laitteella ${latest.station_name ?? dUnit} (XR)\nkVp: ${latest.kvp ?? '?'}, mAs: ${latest.exposure_mAs ?? '?'}\nUniformity: ${chipUnif ?? '?'} %`
              : `Ongelma XR-laitteella: ${dUnit}`
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
