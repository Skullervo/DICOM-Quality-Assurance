import { useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, type ImageResponse } from '../api/client'
import { C, formatDate } from '../components/DeviceShared'
import { VerdictBar } from '../components/qa/VerdictBar'
import { MainArea, type TabId } from '../components/qa/MainArea'
import { DeviceInfo } from '../components/qa/DeviceInfo'
import { PngViewer } from '../components/qa/PngViewer'
import { PagedTrendPanel } from '../components/qa/PagedTrendPanel'
import { buildMetrics, formatDay } from '../lib/qa/adapt'
import { useTolerances } from '../lib/qa/useTolerances'
import { hasTolerance, deriveVerdict, failingDetails } from '../lib/qa/status'
import type { ReportContext } from '../components/qa/ReportTab'

const VERDICT_FI = { pass: 'Pass', warn: 'Warning', fail: 'Fail', nodata: 'No data' } as const
const rnd = (v: unknown, p = 2) => (typeof v === 'number' ? v.toFixed(p) : '?')

// Vasemman paneelin kuvavalinnat (yksi pudotusvalikko). 'dicom' = DICOM-kuva
// (zoom/pan + harmaasävysäätö); muut = esirenderöidyt analyysikuvat.
const IMAGE_OPTIONS = [
  { key: 'dicom', label: 'DICOM image' },
  { key: 'contrast_rois', label: 'ROI map' },
  { key: 'mtf_lp', label: 'Line pair' },
  { key: 'mtf_curve', label: 'MTF curve' },
]
const PLOT_KEYS = ['mtf_curve'] // kaaviokuvat -> ei harmaasävysäätöä

export default function XrayDeviceDetails() {
  const { inst, unit } = useParams<{ inst: string; unit: string }>()
  const dInst = inst ? decodeURIComponent(inst) : ''
  const dUnit = unit ? decodeURIComponent(unit) : ''
  const [imgSel, setImgSel] = useState('dicom')
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('analyysi')
  const panelHidden = activeTab !== 'analyysi' // piilota vasen paneeli AI-/raporttivälilehdillä

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

  // Oletuksena korosta kuvaikkunan mittaus (uusin, kun ei valittu erikseen)
  const defaultActiveIdx = chartData?.findIndex((p) => String(p.instance) === activeInstanceId) ?? -1
  const activeIdx = selectedIdx ?? (defaultActiveIdx >= 0 ? defaultActiveIdx : undefined)

  const { data: dicomImg } = useQuery<ImageResponse>({
    queryKey: ['xray', 'image', activeInstanceId],
    queryFn: () => api.xrayImage(activeInstanceId),
    enabled: !!activeInstanceId && imgSel === 'dicom', retry: false,
  })

  const handlePointClick = useCallback((idx: number) => {
    setSelectedIdx(prev => prev === idx ? null : idx)
  }, [])

  // Chip-arvot: valittu piste tai uusin
  const num = (v: unknown) => (typeof v === 'number' ? v : null)
  const chipUnif = num(selectedPoint?.uniformity_deviation ?? latest?.uniformity_deviation)
  const chipMtf = num(selectedPoint?.mtf_50_percent ?? latest?.mtf_50_percent)
  const chipCnr = num(selectedPoint?.median_cnr ?? latest?.median_cnr)

  // Config-vetoiset metriikat + DB-toleranssit; verdiktiin vain toleranssilliset
  const { data: tolerances } = useTolerances()
  const metrics = buildMetrics('XR', latest, (chartData ?? []) as Record<string, unknown>[], tolerances)
  const verdictMetrics = metrics.filter(hasTolerance)
  const v = deriveVerdict(verdictMetrics)
  const verdictDevice = {
    deviceId: String(latest?.station_name ?? dUnit),
    phantom: latest?.phantom_model ? String(latest.phantom_model) : undefined,
    measuredAt: formatDay(latest?.content_date as string | undefined),
    previousAt: formatDay(detail?.[1]?.content_date as string | undefined),
  }


  const reportCtx: ReportContext = {
    sections: latest
      ? [
          { title: 'DICOM info', rows: [
            { label: 'Device', value: String(latest.station_name ?? dUnit) },
            { label: 'Institution', value: String(latest.institution_name ?? '—') },
            { label: 'Phantom', value: String(latest.phantom_model ?? 'NORMI-13') },
            { label: 'kVp', value: String(latest.kvp ?? '—') },
            { label: 'mAs', value: String(latest.exposure_mAs ?? '—') },
            { label: 'Model', value: String(latest.manufacturer_model_name ?? '—') },
            { label: 'Date', value: verdictDevice.measuredAt ?? '—' },
          ] },
          { title: 'Analysis results', rows: [
            { label: 'Uniformity', value: `${rnd(chipUnif)} %` },
            { label: 'MTF 50%', value: `${rnd(chipMtf)} lp/mm` },
            { label: 'Median CNR', value: rnd(chipCnr) },
            { label: 'Verdict', value: `${VERDICT_FI[v.verdict]} (${v.pass}/${v.measured})` },
          ] },
        ]
      : [{ title: 'Device', rows: [{ label: 'Device', value: `${dUnit} (XR)` }] }],
    failing: failingDetails(verdictMetrics),
    modality: String(latest?.modality ?? 'CR'),
    station: String(latest?.station_name ?? dUnit),
  }

  // Raportin kuvaliitteet: analyysikuvat (ei DICOM)
  const reportAttachments = activeInstanceId
    ? IMAGE_OPTIONS.filter((o) => o.key !== 'dicom').map((o) => ({
        key: o.key, label: o.label, url: api.xrayAnalysisImageUrl(activeInstanceId, o.key),
      }))
    : []

  return (
    <div className="device-shell" style={panelHidden ? { gridTemplateColumns: '1fr', gridTemplateRows: '1fr' } : undefined}>

      {/* === VASEN PANEELI (piilotettu AI-/raporttivälilehdillä) === */}
      {!panelHidden && (
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden',
        borderRight: `1px solid ${C.border}`, background: C.bg }}>
        <div className="shrink-0 flex items-center justify-between"
          style={{ height: 46, boxSizing: 'border-box', padding: '0 14px', borderBottom: `1px solid ${C.border}` }}>
          <span title={String(latest?.manufacturer_model_name ?? '')}
            style={{ fontSize: 13.5, fontWeight: 600, color: C.neutral, flex: 1, minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>
            {String(latest?.manufacturer_model_name || latest?.station_name || 'Device')}
          </span>
          <span style={{ fontSize: 10, fontFamily: 'var(--mono)', padding: '2px 8px', borderRadius: 4,
            background: 'rgba(96,165,250,0.15)', color: '#93c5fd', border: '1px solid rgba(96,165,250,0.3)' }}>XR</span>
        </div>

        {/* Kuva — yksi pudotusvalikko + kuvaikkuna */}
        {activeInstanceId && (
          <div style={{ flexShrink: 0, padding: '16px 10px 10px', borderBottom: `1px solid ${C.border}` }}>
            <select value={imgSel} onChange={(e) => setImgSel(e.target.value)}
              aria-label="Select image"
              style={{
                width: '100%', marginBottom: 8, fontSize: 12, padding: '5px 8px', borderRadius: 5,
                background: C.surface2, color: C.neutral, border: `1px solid ${C.border}`,
                fontFamily: 'var(--font-family)',
              }}>
              {IMAGE_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>

            {imgSel === 'dicom' ? (
              dicomImg?.image
                ? <PngViewer key={activeInstanceId} src={`data:${dicomImg.mime ?? 'image/jpeg'};base64,${dicomImg.image}`} alt="DICOM" />
                : <div style={{ background: '#000', borderRadius: 6, aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: C.muted, fontSize: 11 }}>Image not available</span>
                  </div>
            ) : (
              <PngViewer key={imgSel} src={api.xrayAnalysisImageUrl(activeInstanceId, imgSel)} alt={imgSel}
                adjustable={!PLOT_KEYS.includes(imgSel)} />
            )}
          </div>
        )}

        {/* Laitetiedot — chipit + Lisätiedot */}
        <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
          {latest && (
            <DeviceInfo
              chips={[
                { label: 'Modality', value: String(latest.modality ?? 'XR') },
                { label: 'Phantom', value: String(latest.phantom_model ?? 'NORMI-13') },
                { label: 'kVp', value: String(latest.kvp ?? '') },
                { label: 'mAs', value: String(latest.exposure_mAs ?? '') },
                { label: 'Date', value: formatDay(latest.content_date as string | undefined) ?? '' },
              ]}
              more={[
                { label: 'Device', value: String(latest.station_name ?? '') },
                { label: 'Institution', value: String(latest.institution_name ?? '') },
                { label: 'Manufacturer', value: String(latest.manufacturer ?? '') },
                { label: 'Model', value: String(latest.manufacturer_model_name ?? '') },
              ]}
            />
          )}
        </div>

        {/* Verdiktti — kompakti, vasemman paneelin alakulmassa */}
        {latest && <VerdictBar device={verdictDevice} metrics={verdictMetrics} compact card />}
      </div>
      )}

      {/* PÄÄALUE — välilehdet (Analyysi / Kysy tekoälyltä / Raportoi ongelmasta) */}
      <MainArea
        onTabChange={setActiveTab}
        reportContext={reportCtx}
        reportAttachments={reportAttachments}
        breadcrumb={
          <nav className="text-[12px] flex gap-1 flex-wrap" style={{ color: C.muted }}>
            <Link to="/" className="hover:text-white">Home</Link><span>/</span>
            <Link to="/xray/institutions" className="hover:text-white">X-ray</Link><span>/</span>
            <Link to={`/xray/units?institution=${encodeURIComponent(dInst)}`} className="hover:text-white">{dInst}</Link><span>/</span>
            <span style={{ color: C.neutral }}>{dUnit}</span>
            {selectedPoint && <span style={{ color: C.accent }}>· selected measurement {formatDate(String(selectedPoint.study_date ?? ''))}</span>}
          </nav>
        }
      >
        {latest && (
          <PagedTrendPanel title="Measurement trends" metrics={metrics} perPage={3} chromeless dimTitle
            activeIndex={activeIdx} onSelect={handlePointClick} />
        )}
      </MainArea>
    </div>
  )
}
