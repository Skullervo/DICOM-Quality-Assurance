import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer
} from 'recharts'
import { api } from '../api/client'
import { C, MetaRow, formatDate } from '../components/DeviceShared'
import { VerdictBar } from '../components/qa/VerdictBar'
import { MetricCard } from '../components/qa/MetricCard'
import { MainArea } from '../components/qa/MainArea'
import { ConsolidatedTrend } from '../components/qa/ConsolidatedTrend'
import { buildMetrics, formatDay } from '../lib/qa/adapt'
import { hasTolerance } from '../lib/qa/status'

const IMAGE_TABS = [
  { key: 'hu_linearity', label: 'HU-lin.' },
  { key: 'thickness', label: 'Paksuus' },
  { key: 'uniformity', label: 'Unif.' },
  { key: 'mtf', label: 'MTF' },
  { key: 'low_contrast', label: 'Matala K.' },
]
const CHART_TABS = [
  { key: 'hu_linearity_chart', label: 'HU scatter' },
  { key: 'mtf_chart', label: 'MTF-käyrä' },
  { key: 'uniformity_profile', label: 'Profiilit' },
  { key: 'side_view', label: 'Sivunäkymä' },
]

type CTChartDef = { dataKey: string; label: string; color: string; nominal?: number }

// Trendikäyrät ryhmitelty välilehtiin (vähemmän kerralla, isommat)
const CHART_GROUPS: { key: string; label: string; charts: CTChartDef[] }[] = [
  { key: 'hu', label: 'HU-poikkeama', charts: [
    { dataKey: 'hu_air', label: 'HU Ilma', nominal: -1000, color: '#94a3b8' },
    { dataKey: 'hu_pmp', label: 'HU PMP', nominal: -196, color: '#7dd3fc' },
    { dataKey: 'hu_ldpe', label: 'HU LDPE', nominal: -104, color: '#6ee7b7' },
    { dataKey: 'hu_poly', label: 'HU Poly', nominal: -35, color: '#fde68a' },
    { dataKey: 'hu_acrylic', label: 'HU Akryyli', nominal: 120, color: '#60a5fa' },
    { dataKey: 'hu_delrin', label: 'HU Delrin', nominal: 340, color: '#f59e0b' },
    { dataKey: 'hu_teflon', label: 'HU Teflon', nominal: 990, color: '#f87171' },
  ] },
  { key: 'laatu', label: 'Laatumetriikat', charts: [
    { dataKey: 'uniformity_index', label: 'Uniformiteetti [%]', color: '#52e3a0' },
    { dataKey: 'mtf_50_percent', label: 'MTF 50% [lp/cm]', color: '#a78bfa' },
    { dataKey: 'num_low_contrast_rois_seen', label: 'Matalakontrasti-ROI', color: '#fb923c' },
    { dataKey: 'noise_hu_std', label: 'Kohina (HU std)', color: '#64748b' },
    { dataKey: 'slice_thickness_mm', label: 'Viipalepaksuus [mm]', color: '#a3e635' },
  ] },
]

function CTChart({ data, dataKey, label, nominal, color }: {
  data: Record<string, unknown>[]; dataKey: string; label: string; nominal?: number; color: string
}) {
  const chartData = data.map(d => ({
    date: formatDate(String(d.study_date ?? '')),
    value: d[dataKey] as number | null,
  })).filter(d => d.value !== null)
  if (chartData.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
      <h3 className="text-[11px] font-medium" style={{ color: C.neutral, margin: 0 }}>{label}</h3>
      <div style={{ flex: 1, minHeight: 0 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 2, right: 6, left: -14, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
          <XAxis dataKey="date" tick={{ fontSize: 8, fill: C.muted }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 8, fill: C.muted }} width={48} />
          <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, fontSize: 10 }} />
          {nominal !== undefined && <ReferenceLine y={nominal} stroke="#6b7280" strokeDasharray="4 2"
            label={{ value: `nom:${nominal}`, fill: '#6b7280', fontSize: 8 }} />}
          <Line type="linear" dataKey="value" stroke={color} dot={{ r: 2.5, fill: color }} strokeWidth={1.5} connectNulls />
        </LineChart>
      </ResponsiveContainer>
      </div>
    </div>
  )
}

export default function CTDeviceDetails() {
  const { id } = useParams<{ id: string }>()
  const station = id ? decodeURIComponent(id) : ''
  const [imgTab, setImgTab] = useState('hu_linearity')
  const [chartTab, setChartTab] = useState('hu_linearity_chart')
  const [group, setGroup] = useState('hu')

  const { data: detail } = useQuery<Record<string, unknown>[]>({
    queryKey: ['ct', 'device', station], queryFn: () => api.ctDeviceDetail(station), enabled: !!station,
  })
  const { data: chartData } = useQuery<Record<string, unknown>[]>({
    queryKey: ['ct', 'data', station], queryFn: () => api.ctData(station) as Promise<Record<string, unknown>[]>, enabled: !!station,
  })
  const latest = detail?.[0] ?? null
  const instanceId = latest ? String(latest.instance ?? '') : ''

  const imgUrl = instanceId ? api.ctAnalysisImageUrl(instanceId, imgTab) : null
  const chartImgUrl = instanceId ? api.ctAnalysisImageUrl(instanceId, chartTab) : null

  // Config-vetoiset metriikat; verdiktiin vain toleranssilliset
  const metrics = buildMetrics('CT', latest, (chartData ?? []) as Record<string, unknown>[])
  const verdictMetrics = metrics.filter(hasTolerance)
  const verdictDevice = {
    deviceId: String(latest?.station_name ?? station),
    phantom: latest?.phantom_model ? String(latest.phantom_model) : undefined,
    measuredAt: formatDay(latest?.content_date as string | undefined),
    previousAt: formatDay(detail?.[1]?.content_date as string | undefined),
  }

  const aiCtx = latest
    ? `CT-laite: ${latest.station_name ?? station}\nPhantom: ${latest.phantom_model ?? '?'}\nkVp: ${latest.kvp ?? '?'}, mAs: ${latest.exposure_mAs ?? '?'}\nHU Air: ${latest.hu_air ?? '?'}, Acrylic: ${latest.hu_acrylic ?? '?'}, Teflon: ${latest.hu_teflon ?? '?'}\nUniformity: ${latest.uniformity_index ?? '?'} %, MTF 50%: ${latest.mtf_50_percent ?? '?'} lp/cm\nOverall: ${latest.overall_pass === true ? 'PASS' : latest.overall_pass === false ? 'FAIL' : '?'}`
    : `CT-laite: ${station}`

  const reportDefault = latest
    ? `Ongelma laitteella ${latest.station_name ?? station} (CT)\nPhantom: ${latest.phantom_model ?? '?'}\nHU Acrylic: ${latest.hu_acrylic ?? '?'}, Uniformity: ${latest.uniformity_index ?? '?'} %\nOverall: ${latest.overall_pass === true ? 'PASS' : latest.overall_pass === false ? 'FAIL' : '?'}`
    : `Ongelma CT-laitteella: ${station}`

  return (
    <div style={{
      position: 'fixed', top: 'var(--navbar-height)', left: 0, right: 0, bottom: 0,
      display: 'grid', gridTemplateColumns: '300px 1fr', background: C.bg,
    }}>

      {/* === VASEN PANEELI === */}
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden',
        borderRight: `1px solid ${C.border}`, background: C.surface }}>
        <div className="shrink-0 flex items-center justify-between"
          style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase', color: C.muted }}>Laitetiedot</span>
          <span style={{ fontSize: 10, fontFamily: 'monospace', padding: '2px 8px', borderRadius: 4,
            background: 'rgba(45,212,191,0.15)', color: '#5eead4', border: '1px solid rgba(45,212,191,0.3)' }}>CT</span>
        </div>

        {/* Kuva + kaaviokuvat */}
        {instanceId && (
          <div style={{ flexShrink: 0, padding: '8px 10px', borderBottom: `1px solid ${C.border}` }}>
            <div className="flex gap-0.5 mb-1.5 flex-wrap">
              {IMAGE_TABS.map(t => (
                <button key={t.key} onClick={() => setImgTab(t.key)}
                  className="px-1.5 py-0.5 text-[9px] rounded transition"
                  style={{
                    background: imgTab === t.key ? C.surface2 : 'transparent',
                    color: imgTab === t.key ? C.accent : C.muted,
                    borderBottom: imgTab === t.key ? `2px solid ${C.accent}` : '2px solid transparent',
                  }}>
                  {t.label}
                </button>
              ))}
            </div>
            <div style={{ background: '#000', borderRadius: 6, aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {imgUrl ? (
                <img src={imgUrl} alt={imgTab} style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  onError={e => { (e.target as HTMLImageElement).src = ''; (e.target as HTMLImageElement).alt = 'Ei saatavilla' }} />
              ) : <span className="text-[10px]" style={{ color: C.muted }}>Kuva ei saatavilla</span>}
            </div>

            <div className="flex gap-0.5 mb-1.5 mt-2 flex-wrap">
              {CHART_TABS.map(t => (
                <button key={t.key} onClick={() => setChartTab(t.key)}
                  className="px-1.5 py-0.5 text-[9px] rounded transition"
                  style={{
                    background: chartTab === t.key ? C.surface2 : 'transparent',
                    color: chartTab === t.key ? C.warn : C.muted,
                    borderBottom: chartTab === t.key ? `2px solid ${C.warn}` : '2px solid transparent',
                  }}>
                  {t.label}
                </button>
              ))}
            </div>
            <div style={{ background: '#000', borderRadius: 6, aspectRatio: '16/10', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {chartImgUrl ? (
                <img src={chartImgUrl} alt={chartTab} style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  onError={e => { (e.target as HTMLImageElement).src = ''; (e.target as HTMLImageElement).alt = 'Ei saatavilla' }} />
              ) : <span className="text-[10px]" style={{ color: C.muted }}>Kaavio ei saatavilla</span>}
            </div>
          </div>
        )}

        {/* Metatiedot — skrollaava */}
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
              <MetaRow label="Phantom" value={String(latest.phantom_model ?? '—')} />
              <MetaRow label="kVp" value={String(latest.kvp ?? '—')} />
              <MetaRow label="Valotus (mAs)" value={String(latest.exposure_mAs ?? '—')} />
              <MetaRow label="Viipalepaksuus" value={latest.slice_thickness ? `${latest.slice_thickness} mm` : '—'} />
              <div className="flex justify-between" style={{ padding: '8px 14px', borderTop: `1px solid ${C.border}` }}>
                <span className="text-[11px]" style={{ color: C.muted }}>Overall</span>
                <span className="text-[11px] font-bold" style={{
                  color: latest.overall_pass === true ? C.ok : latest.overall_pass === false ? C.bad : C.muted
                }}>
                  {latest.overall_pass === null || latest.overall_pass === undefined ? '—' : latest.overall_pass ? 'PASS' : 'FAIL'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* PÄÄALUE — välilehdet (Analyysi / Kysy tekoälyltä / Raportoi ongelmasta) */}
      <MainArea
        aiContext={aiCtx}
        reportDefault={reportDefault}
        breadcrumb={
          <nav className="text-[12px] flex gap-1 flex-wrap" style={{ color: C.muted }}>
            <Link to="/" className="hover:text-white">Aloitus</Link><span>/</span>
            <Link to="/ct/institutions" className="hover:text-white">TT</Link><span>/</span>
            <Link to="/ct/units" className="hover:text-white">Laitteet</Link><span>/</span>
            <span style={{ color: C.neutral }}>{station}</span>
          </nav>
        }
      >
        {latest && <VerdictBar device={verdictDevice} metrics={verdictMetrics} />}

        {latest && (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            {metrics.map((m) => <MetricCard key={m.id} metric={m} />)}
          </div>
        )}

        {/* Trend charts — ryhmitelty välilehtiin */}
        <div className="rounded-md" style={{ background: C.surface, border: `1px solid ${C.border}`, padding: 10, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexShrink: 0 }}>
            {CHART_GROUPS.map((g) => (
              <button
                key={g.key}
                onClick={() => setGroup(g.key)}
                className="text-[11px] rounded px-2 py-1"
                style={{
                  background: group === g.key ? C.accent : 'transparent',
                  color: group === g.key ? '#fff' : C.muted,
                  border: `1px solid ${group === g.key ? C.accent : C.border}`,
                }}
              >
                {g.label} ({g.charts.length})
              </button>
            ))}
          </div>
          {chartData && chartData.length > 0 ? (
            group === 'hu' ? (
              // Konsolidoitu: 7 HU-materiaalia yhtenä poikkeama-nominaalista -käyränä
              <ConsolidatedTrend metrics={metrics.filter((m) => m.id.startsWith('hu_'))} tol={40} warn={20} unit="HU" />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridAutoRows: '150px', gap: '8px 12px' }}>
                {(CHART_GROUPS.find((g) => g.key === group)?.charts ?? []).map((c) => (
                  <CTChart key={c.dataKey} data={chartData} dataKey={c.dataKey} label={c.label} nominal={c.nominal} color={c.color} />
                ))}
              </div>
            )
          ) : (
            <p className="text-[11px]" style={{ color: C.muted }}>Ei trendidataa saatavilla.</p>
          )}
        </div>
      </MainArea>
    </div>
  )
}
