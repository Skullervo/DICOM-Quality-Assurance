import { useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { C } from '../components/DeviceShared'
import { VerdictBar } from '../components/qa/VerdictBar'
import { MainArea } from '../components/qa/MainArea'
import { DeviceInfo } from '../components/qa/DeviceInfo'
import { ImageViewer } from '../components/qa/ImageViewer'
import { PngViewer } from '../components/qa/PngViewer'
import { RoiOverlay, type Roi } from '../components/qa/RoiOverlay'
import { PagedTrendPanel } from '../components/qa/PagedTrendPanel'
import { buildMetrics, formatDay } from '../lib/qa/adapt'
import { hasTolerance, deriveVerdict, deriveStatus } from '../lib/qa/status'
import type { Status } from '../lib/qa/types'

const VERDICT_FI = { pass: 'Hyväksytty', warn: 'Varoitus', fail: 'Hylätty', nodata: 'Ei dataa' } as const
const rnd = (v: unknown, p = 2) => (typeof v === 'number' ? v.toFixed(p) : '?')

// Vasemman paneelin kuvavalinnat (yksi pudotusvalikko, säästää tilaa vs. välilehdet).
// 'dicom' = interaktiivinen DICOM-leike (säädettävä W/L); muut = esirenderöidyt
// analyysikuvat (ei harmaasävysäätöä).
const IMAGE_OPTIONS = [
  { key: 'dicom', label: 'Kuvapakka' },
  { key: 'roi', label: 'ROI-kartta (HU)' },
  { key: 'thickness', label: 'Viipalepaksuus' },
  { key: 'uniformity', label: 'Uniformiteetti' },
  { key: 'mtf', label: 'MTF' },
  { key: 'low_contrast', label: 'Matala kontrasti' },
  { key: 'hu_linearity_chart', label: 'HU scatter' },
  { key: 'mtf_chart', label: 'MTF-käyrä' },
  { key: 'uniformity_profile', label: 'Profiilit' },
  { key: 'side_view', label: 'Sivunäkymä' },
]
// Kaaviokuvat (ei harmaasävyä -> ei kirkkaus/kontrasti-liukuja)
const PLOT_KEYS = ['hu_linearity_chart', 'mtf_chart', 'uniformity_profile']

export default function CTDeviceDetails() {
  const { id } = useParams<{ id: string }>()
  const station = id ? decodeURIComponent(id) : ''
  const [imgSel, setImgSel] = useState('dicom')
  const [hoverRoi, setHoverRoi] = useState<string | null>(null)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)

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
  const handlePointClick = useCallback((idx: number) => setSelectedIdx((prev) => (prev === idx ? null : idx)), [])

  // Config-vetoiset metriikat; verdiktiin vain toleranssilliset
  const metrics = buildMetrics('CT', latest, (chartData ?? []) as Record<string, unknown>[])
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
  const aiCtx = latest
    ? `CT-laite: ${latest.station_name ?? station}\nFantomi: ${latest.phantom_model ?? '?'}\nkVp: ${latest.kvp ?? '?'}, mAs: ${latest.exposure_mAs ?? '?'}\nHU Ilma: ${rnd(latest.hu_air, 0)}, Akryyli: ${rnd(latest.hu_acrylic, 0)}, Teflon: ${rnd(latest.hu_teflon, 0)} HU\nUniformiteetti: ${rnd(latest.uniformity_index)} %, MTF 50%: ${rnd(latest.mtf_50_percent)} lp/cm\nVerdiktti: ${VERDICT_FI[v.verdict]} (${v.pass}/${v.measured})`
    : `CT-laite: ${station}`

  const reportDefault = latest
    ? `Ongelma laitteella ${latest.station_name ?? station} (CT)\nPhantom: ${latest.phantom_model ?? '?'}\nHU Acrylic: ${rnd(latest.hu_acrylic, 0)} HU, Uniformity: ${rnd(latest.uniformity_index)} %\nOverall: ${latest.overall_pass === true ? 'PASS' : latest.overall_pass === false ? 'FAIL' : '?'}`
    : `Ongelma CT-laitteella: ${station}`

  // Raportin kuvaliitteet: analyysikuvat (ei interaktiivinen DICOM-leike)
  const reportAttachments = instanceId
    ? IMAGE_OPTIONS.filter((o) => o.key !== 'dicom').map((o) => ({
        key: o.key, label: o.label,
        url: api.ctAnalysisImageUrl(instanceId, o.key === 'roi' ? 'hu_linearity_clean' : o.key),
      }))
    : []

  return (
    <div className="device-shell">

      {/* === VASEN PANEELI === */}
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden',
        borderRight: `1px solid ${C.border}`, background: C.bg }}>
        <div className="shrink-0 flex items-center justify-between"
          style={{ height: 46, boxSizing: 'border-box', padding: '0 14px', borderBottom: `1px solid ${C.border}` }}>
          <span title={String(latest?.manufacturer_model_name ?? '')}
            style={{ fontSize: 13.5, fontWeight: 600, color: C.neutral, flex: 1, minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>
            {String(latest?.manufacturer_model_name || latest?.station_name || 'Laite')}
          </span>
          <span style={{ fontSize: 10, fontFamily: 'var(--mono)', padding: '2px 8px', borderRadius: 4,
            background: 'rgba(45,212,191,0.15)', color: '#5eead4', border: '1px solid rgba(45,212,191,0.3)' }}>CT</span>
        </div>

        {/* Kuva — yksi pudotusvalikko + kuvaikkuna (säästää tilaa vs. välilehdet) */}
        {instanceId && (
          <div style={{ flexShrink: 0, padding: '16px 10px 10px', borderBottom: `1px solid ${C.border}` }}>
            <select value={imgSel} onChange={(e) => setImgSel(e.target.value)}
              aria-label="Valitse kuva"
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

        {/* Verdiktti — kompakti, vasemman paneelin alakulmassa */}
        {latest && <VerdictBar device={verdictDevice} metrics={verdictMetrics} compact card />}
      </div>

      {/* PÄÄALUE — välilehdet (Analyysi / Kysy tekoälyltä / Raportoi ongelmasta) */}
      <MainArea
        aiContext={aiCtx}
        reportDefault={reportDefault}
        reportAttachments={reportAttachments}
        breadcrumb={
          <nav className="text-[12px] flex gap-1 flex-wrap" style={{ color: C.muted }}>
            <Link to="/" className="hover:text-white">Aloitus</Link><span>/</span>
            <Link to="/ct/institutions" className="hover:text-white">TT</Link><span>/</span>
            <Link to="/ct/units" className="hover:text-white">Laitteet</Link><span>/</span>
            <span style={{ color: C.neutral }}>{station}</span>
            {selectedPoint && <span style={{ color: C.accent }}>· valittu mittaus {formatDay(selectedPoint.study_date as string) ?? ''}</span>}
          </nav>
        }
      >
        {latest && (
          <PagedTrendPanel title="Mittaustrendit" metrics={metrics} perPage={3} chromeless
            activeIndex={selectedIdx ?? undefined} onSelect={handlePointClick}
            highlightId={hoverRoi} onHover={setHoverRoi} />
        )}
      </MainArea>
    </div>
  )
}
