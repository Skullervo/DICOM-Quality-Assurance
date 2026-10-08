import { useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { C } from '../components/DeviceShared'
import { VerdictBar } from '../components/qa/VerdictBar'
import { MainArea, type TabId } from '../components/qa/MainArea'
import { DeviceInfo } from '../components/qa/DeviceInfo'
import { ImageViewer } from '../components/qa/ImageViewer'
import { PngViewer } from '../components/qa/PngViewer'
import { RoiOverlay, type Roi } from '../components/qa/RoiOverlay'
import { PagedTrendPanel } from '../components/qa/PagedTrendPanel'
import { buildMetrics, formatDay } from '../lib/qa/adapt'
import { useTolerances } from '../lib/qa/useTolerances'
import { hasTolerance, deriveVerdict, deriveStatus, failingDetails } from '../lib/qa/status'
import type { Status } from '../lib/qa/types'
import type { ReportContext } from '../components/qa/ReportTab'

const VERDICT_FI = { pass: 'Pass', warn: 'Warning', fail: 'Fail', nodata: 'No data' } as const
const rnd = (v: unknown, p = 2) => (typeof v === 'number' ? v.toFixed(p) : '?')

// Vasemman paneelin kuvavalinnat (yksi pudotusvalikko, säästää tilaa vs. välilehdet).
// 'dicom' = interaktiivinen DICOM-leike (säädettävä W/L); muut = esirenderöidyt
// analyysikuvat (ei harmaasävysäätöä).
const IMAGE_OPTIONS = [
  { key: 'dicom', label: 'Image stack' },
  { key: 'roi', label: 'ROI map (HU)' },
  { key: 'thickness', label: 'Slice thickness' },
  { key: 'uniformity', label: 'Uniformity' },
  { key: 'mtf', label: 'MTF' },
  { key: 'low_contrast', label: 'Low contrast' },
  { key: 'hu_linearity_chart', label: 'HU scatter' },
  { key: 'mtf_chart', label: 'MTF curve' },
  { key: 'uniformity_profile', label: 'Profiles' },
  { key: 'side_view', label: 'Side view' },
]
// Kaaviokuvat (ei harmaasävyä -> ei kirkkaus/kontrasti-liukuja)
const PLOT_KEYS = ['hu_linearity_chart', 'mtf_chart', 'uniformity_profile']

export default function CTDeviceDetails() {
  const { id } = useParams<{ id: string }>()
  const station = id ? decodeURIComponent(id) : ''
  const [imgSel, setImgSel] = useState('dicom')
  const [hoverRoi, setHoverRoi] = useState<string | null>(null)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('analyysi')
  const panelHidden = activeTab !== 'analyysi' // piilota vasen paneeli AI-/raporttivälilehdillä

  const { data: detail } = useQuery<Record<string, unknown>[]>({
    queryKey: ['ct', 'device', station], queryFn: () => api.ctDeviceDetail(station), enabled: !!station,
  })
  const { data: chartData } = useQuery<Record<string, unknown>[]>({
    queryKey: ['ct', 'data', station], queryFn: () => api.ctData(station) as Promise<Record<string, unknown>[]>, enabled: !!station,
  })

  // Valittu trendipiste -> vastaava mittaus (match study_date detail-riviin); muuten uusin
  const selectedPoint = selectedIdx !== null ? (chartData?.[selectedIdx] ?? null) : null
  const latest = selectedPoint
    ? detail?.find((d) => String(d.study_date) === String(selectedPoint.study_date)) ?? detail?.[0] ?? null
    : detail?.[0] ?? null
  const instanceId = latest ? String(latest.instance ?? '') : ''
  // Oletuksena korosta kuvaikkunan mittaus (uusin, kun ei valittu erikseen)
  const defaultActiveIdx = latest ? (chartData?.findIndex((p) => String(p.study_date) === String(latest.study_date)) ?? -1) : -1
  const activeIdx = selectedIdx ?? (defaultActiveIdx >= 0 ? defaultActiveIdx : undefined)
  const handlePointClick = useCallback((idx: number) => setSelectedIdx((prev) => (prev === idx ? null : idx)), [])

  // Config-vetoiset metriikat + DB-toleranssit; verdiktiin vain toleranssilliset
  const { data: tolerances } = useTolerances()
  const metrics = buildMetrics('CT', latest, (chartData ?? []) as Record<string, unknown>[], tolerances)
  const verdictMetrics = metrics.filter(hasTolerance)
  const rois = (latest?.hu_roi_map as Roi[] | undefined) ?? []
  const roiStatus: Record<string, Status> = Object.fromEntries(
    metrics.map((m) => [m.id, m.value != null && hasTolerance(m) ? deriveStatus(m) : 'nodata']),
  )
  const verdictDevice = {
    deviceId: String(latest?.station_name ?? station),
    phantom: latest?.phantom_model ? String(latest.phantom_model) : undefined,
    measuredAt: formatDay(latest?.content_date as string | undefined),
    previousAt: formatDay(detail?.[1]?.content_date as string | undefined),
  }

  const v = deriveVerdict(verdictMetrics)

  const reportCtx: ReportContext = {
    sections: latest
      ? [
          { title: 'DICOM info', rows: [
            { label: 'Device', value: String(latest.station_name ?? station) },
            { label: 'Institution', value: String(latest.institution_name ?? '—') },
            { label: 'Phantom', value: String(latest.phantom_model ?? '—') },
            { label: 'kVp', value: String(latest.kvp ?? '—') },
            { label: 'mAs', value: String(latest.exposure_mAs ?? '—') },
            { label: 'Slice thickness', value: latest.slice_thickness ? `${latest.slice_thickness} mm` : '—' },
            { label: 'Model', value: String(latest.manufacturer_model_name ?? '—') },
            { label: 'Date', value: formatDay(latest.content_date as string | undefined) ?? '—' },
          ] },
          { title: 'Analysis results', rows: [
            { label: 'HU air', value: `${rnd(latest.hu_air, 0)} HU` },
            { label: 'HU acrylic', value: `${rnd(latest.hu_acrylic, 0)} HU` },
            { label: 'HU teflon', value: `${rnd(latest.hu_teflon, 0)} HU` },
            { label: 'Uniformity', value: `${rnd(latest.uniformity_index)} %` },
            { label: 'MTF 50%', value: `${rnd(latest.mtf_50_percent)} lp/cm` },
            { label: 'Verdict', value: `${VERDICT_FI[v.verdict]} (${v.pass}/${v.measured})` },
          ] },
        ]
      : [{ title: 'Device', rows: [{ label: 'Device', value: `${station} (CT)` }] }],
    failing: failingDetails(verdictMetrics),
    modality: 'CT',
    station,
  }

  // Raportin kuvaliitteet: analyysikuvat (ei interaktiivinen DICOM-leike)
  const reportAttachments = instanceId
    ? IMAGE_OPTIONS.filter((o) => o.key !== 'dicom').map((o) => ({
        key: o.key, label: o.label,
        url: api.ctAnalysisImageUrl(instanceId, o.key === 'roi' ? 'hu_linearity_clean' : o.key),
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
          <div style={{ flex: 1, minWidth: 0, marginRight: 8, display: 'flex', flexDirection: 'column', justifyContent: 'center', lineHeight: 1.2, overflow: 'hidden' }}>
            {latest?.manufacturer ? (
              <span title={String(latest.manufacturer)}
                style={{ fontSize: 9.5, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {String(latest.manufacturer)}
              </span>
            ) : null}
            <span title={String(latest?.manufacturer_model_name ?? '')}
              style={{ fontSize: 13.5, fontWeight: 600, color: C.neutral, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {String(latest?.manufacturer_model_name || latest?.station_name || 'Device')}
            </span>
          </div>
          <span style={{ fontSize: 10, fontFamily: 'var(--mono)', padding: '2px 8px', borderRadius: 4,
            background: 'rgba(45,212,191,0.15)', color: '#5eead4', border: '1px solid rgba(45,212,191,0.3)' }}>CT</span>
        </div>

        {/* Kuva — yksi pudotusvalikko + kuvaikkuna (säästää tilaa vs. välilehdet) */}
        {instanceId && (
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
              // Kuvapakka: aito W/L + viipaleselailu + zoom/pan
              <ImageViewer key={instanceId} instance={instanceId} />
            ) : imgSel === 'roi' ? (
              // ROI-kartta: puhdas leike + interaktiiviset ROI:t, kytketty KPI-kortteihin
              <RoiOverlay src={api.ctAnalysisImageUrl(instanceId, 'hu_linearity_clean')} rois={rois}
                statusById={roiStatus} hoverId={hoverRoi} onHover={setHoverRoi} />
            ) : (
              // Analyysikuva: zoom/pan + kirkkaus/kontrasti (paitsi kaaviot)
              <PngViewer key={imgSel} src={api.ctAnalysisImageUrl(instanceId, imgSel)} alt={imgSel}
                adjustable={!PLOT_KEYS.includes(imgSel)} />
            )}
          </div>
        )}

        {/* Laitetiedot — chipit + Lisätiedot */}
        <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
          {latest && (
            <DeviceInfo
              chips={[
                { label: 'Modality', value: 'CT' },
                { label: 'Phantom', value: String(latest.phantom_model ?? '') },
                { label: 'kVp', value: String(latest.kvp ?? '') },
                { label: 'mAs', value: String(latest.exposure_mAs ?? '') },
                { label: 'Slice', value: latest.slice_thickness ? `${latest.slice_thickness} mm` : '' },
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
        breadcrumb={null}
      >
        {latest && (
          <PagedTrendPanel title="Measurement trends" metrics={metrics} perPage={3} chromeless dimTitle
            activeIndex={activeIdx} onSelect={handlePointClick}
            highlightId={hoverRoi} onHover={setHoverRoi} />
        )}
      </MainArea>
    </div>
  )
}
