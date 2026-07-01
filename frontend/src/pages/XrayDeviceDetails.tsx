import { useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, type ImageResponse } from '../api/client'
import { C, MetaRow, formatDate } from '../components/DeviceShared'
import { VerdictBar } from '../components/qa/VerdictBar'
import { MetricCard } from '../components/qa/MetricCard'
import { MainArea } from '../components/qa/MainArea'
import { buildMetrics, formatDay } from '../lib/qa/adapt'
import { hasTolerance } from '../lib/qa/status'

const IMAGE_TABS = [
  { key: 'dicom', label: 'DICOM' },
  { key: 'contrast_rois', label: 'ROI-kartta' },
  { key: 'mtf_lp', label: 'Viivapari' },
  { key: 'mtf_curve', label: 'MTF-käyrä' },
]

export default function XrayDeviceDetails() {
  const { inst, unit } = useParams<{ inst: string; unit: string }>()
  const dInst = inst ? decodeURIComponent(inst) : ''
  const dUnit = unit ? decodeURIComponent(unit) : ''
  const [imgTab, setImgTab] = useState('dicom')
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

  const aiCtx = latest
    ? `Röntgenlaite: ${latest.station_name ?? dUnit}\nkVp: ${latest.kvp ?? '?'}, mAs: ${latest.exposure_mAs ?? '?'}\nUniformity: ${chipUnif ?? '?'} %\nMTF 50%: ${chipMtf ?? '?'} lp/mm\nCNR: ${chipCnr ?? '?'}`
    : `Röntgenlaite: ${dUnit}`

  const reportDefault = latest
    ? `Ongelma laitteella ${latest.station_name ?? dUnit} (XR)\nkVp: ${latest.kvp ?? '?'}, mAs: ${latest.exposure_mAs ?? '?'}\nUniformity: ${chipUnif ?? '?'} %`
    : `Ongelma XR-laitteella: ${dUnit}`

  // Config-vetoiset metriikat; verdiktiin vain toleranssilliset
  const metrics = buildMetrics('XR', latest, (chartData ?? []) as Record<string, unknown>[])
  const verdictMetrics = metrics.filter(hasTolerance)
  const verdictDevice = {
    deviceId: String(latest?.station_name ?? dUnit),
    phantom: latest?.phantom_model ? String(latest.phantom_model) : undefined,
    measuredAt: formatDay(latest?.content_date as string | undefined),
    previousAt: formatDay(detail?.[1]?.content_date as string | undefined),
  }

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

      {/* PÄÄALUE — välilehdet (Analyysi / Kysy tekoälyltä / Raportoi ongelmasta) */}
      <MainArea
        aiContext={aiCtx}
        reportDefault={reportDefault}
        breadcrumb={
          <nav className="text-[12px] flex gap-1 flex-wrap" style={{ color: C.muted }}>
            <Link to="/" className="hover:text-white">Aloitus</Link><span>/</span>
            <Link to="/xray/institutions" className="hover:text-white">Röntgen</Link><span>/</span>
            <Link to={`/xray/units?institution=${encodeURIComponent(dInst)}`} className="hover:text-white">{dInst}</Link><span>/</span>
            <span style={{ color: C.neutral }}>{dUnit}</span>
            {selectedPoint && <span style={{ color: C.accent }}>· valittu mittaus {formatDate(String(selectedPoint.study_date ?? ''))}</span>}
          </nav>
        }
      >
        {latest && <VerdictBar device={verdictDevice} metrics={verdictMetrics} />}

        {latest && (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            {metrics.map((m) => (
              <MetricCard key={m.id} metric={m} activeIndex={selectedIdx ?? undefined} onSelect={handlePointClick} />
            ))}
          </div>
        )}

      </MainArea>
    </div>
  )
}
