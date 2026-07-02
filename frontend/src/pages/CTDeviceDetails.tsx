import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { C } from '../components/DeviceShared'
import { VerdictBar } from '../components/qa/VerdictBar'
import { MetricsSection } from '../components/qa/MetricsSection'
import { MainArea } from '../components/qa/MainArea'
import { DeviceInfo } from '../components/qa/DeviceInfo'
import { ImageViewer } from '../components/qa/ImageViewer'
import { buildMetrics, formatDay } from '../lib/qa/adapt'
import { hasTolerance, deriveVerdict } from '../lib/qa/status'

const VERDICT_FI = { pass: 'Hyväksytty', warn: 'Varoitus', fail: 'Hylätty', nodata: 'Ei dataa' } as const
const rnd = (v: unknown, p = 2) => (typeof v === 'number' ? v.toFixed(p) : '?')

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

export default function CTDeviceDetails() {
  const { id } = useParams<{ id: string }>()
  const station = id ? decodeURIComponent(id) : ''
  const [imgTab, setImgTab] = useState('hu_linearity')
  const [chartTab, setChartTab] = useState('hu_linearity_chart')

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

  const v = deriveVerdict(verdictMetrics)
  const aiCtx = latest
    ? `CT-laite: ${latest.station_name ?? station}\nFantomi: ${latest.phantom_model ?? '?'}\nkVp: ${latest.kvp ?? '?'}, mAs: ${latest.exposure_mAs ?? '?'}\nHU Ilma: ${rnd(latest.hu_air, 0)}, Akryyli: ${rnd(latest.hu_acrylic, 0)}, Teflon: ${rnd(latest.hu_teflon, 0)} HU\nUniformiteetti: ${rnd(latest.uniformity_index)} %, MTF 50%: ${rnd(latest.mtf_50_percent)} lp/cm\nVerdiktti: ${VERDICT_FI[v.verdict]} (${v.pass}/${v.measured})`
    : `CT-laite: ${station}`

  const reportDefault = latest
    ? `Ongelma laitteella ${latest.station_name ?? station} (CT)\nPhantom: ${latest.phantom_model ?? '?'}\nHU Acrylic: ${latest.hu_acrylic ?? '?'}, Uniformity: ${latest.uniformity_index ?? '?'} %\nOverall: ${latest.overall_pass === true ? 'PASS' : latest.overall_pass === false ? 'FAIL' : '?'}`
    : `Ongelma CT-laitteella: ${station}`

  return (
    <div className="device-shell">

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
            {/* Ensisijainen: interaktiivinen DICOM-leike (W/L + zoom + viipaleselailu) */}
            <ImageViewer key={instanceId} instance={instanceId} />
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.04em', color: C.muted, margin: '12px 0 4px' }}>
              Analyysikuvat
            </div>
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

        {/* Laitetiedot — chipit + Lisätiedot */}
        <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
          {latest && (
            <DeviceInfo
              chips={[
                { label: 'Modaliteetti', value: 'CT' },
                { label: 'Fantomi', value: String(latest.phantom_model ?? '') },
                { label: 'kVp', value: String(latest.kvp ?? '') },
                { label: 'mAs', value: String(latest.exposure_mAs ?? '') },
                { label: 'Leike', value: latest.slice_thickness ? `${latest.slice_thickness} mm` : '' },
                { label: 'Pvm', value: formatDay(latest.content_date as string | undefined) ?? '' },
              ]}
              more={[
                { label: 'Laite', value: String(latest.station_name ?? '') },
                { label: 'Instituutio', value: String(latest.institution_name ?? '') },
                { label: 'Valmistaja', value: String(latest.manufacturer ?? '') },
                { label: 'Malli', value: String(latest.manufacturer_model_name ?? '') },
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
          <nav className="text-[12px] flex gap-1 flex-wrap" style={{ color: C.muted }}>
            <Link to="/" className="hover:text-white">Aloitus</Link><span>/</span>
            <Link to="/ct/institutions" className="hover:text-white">TT</Link><span>/</span>
            <Link to="/ct/units" className="hover:text-white">Laitteet</Link><span>/</span>
            <span style={{ color: C.neutral }}>{station}</span>
          </nav>
        }
      >
        {latest && <VerdictBar device={verdictDevice} metrics={verdictMetrics} />}

        {latest && <MetricsSection metrics={metrics} />}
      </MainArea>
    </div>
  )
}
