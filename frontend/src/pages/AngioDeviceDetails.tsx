// =============================================================================
// pages/AngioDeviceDetails.tsx — Yhden angiografialaitteen QA-sivu (/angio/device/:inst/:unit)
// =============================================================================
// Käytännössä identtinen XrayDeviceDetails-sivun kanssa, mutta angiografialle/
// läpivalaisulle (DICOM modality XA, Leeds TOR-18 -fantomi). Laite tunnistetaan
// laitos (inst) + yksikkö (unit) -parilla, metriikat rakennetaan 'ANGIO'-
// konfiguraatiolla, ja kuvat haetaan angio-API:n kautta.
// =============================================================================

import { useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, type ImageResponse } from '../api/client'
import { C } from '../components/DeviceShared'
import { VerdictBar } from '../components/qa/VerdictBar'
import { MainArea, type TabId } from '../components/qa/MainArea'
import { DeviceInfo } from '../components/qa/DeviceInfo'
import { MetricValues } from '../components/qa/MetricValues'
import { PngViewer } from '../components/qa/PngViewer'
import { PagedTrendPanel } from '../components/qa/PagedTrendPanel'
import { buildMetrics, formatDay } from '../lib/qa/adapt'
import { useTolerances } from '../lib/qa/useTolerances'
import { hasTolerance, deriveVerdict, failingDetails } from '../lib/qa/status'
import type { ReportContext } from '../components/qa/ReportTab'

// Verdiktin näyttönimet ja pyöristysapu.
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

export default function AngioDeviceDetails() {
  // Laitos (inst) ja yksikkö (unit) URL-polusta — laitteen tunniste.
  const { inst, unit } = useParams<{ inst: string; unit: string }>()
  const dInst = inst ? decodeURIComponent(inst) : ''
  const dUnit = unit ? decodeURIComponent(unit) : ''
  const [imgSel, setImgSel] = useState('dicom')                       // valittu kuvatyyppi
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null) // valittu trendipiste
  const [activeTab, setActiveTab] = useState<TabId>('analyysi')
  const panelHidden = activeTab !== 'analyysi' // piilota vasen paneeli AI-/raporttivälilehdillä

  // Laitteen mittaukset ja trenddata.
  const { data: detail } = useQuery<Record<string, unknown>[]>({
    queryKey: ['angio', 'device', dInst, dUnit],
    queryFn: () => api.angioDeviceDetail(dInst, dUnit), enabled: !!(dInst && dUnit),
  })
  const { data: chartData } = useQuery<Record<string, unknown>[]>({
    queryKey: ['angio', 'data', dUnit],
    queryFn: () => api.angioData(dUnit), enabled: !!dUnit,
  })

  // Selected trend point -> which instance/measurement to show
  // Valittu piste määrää näytettävän instanssin; muuten uusin.
  const selectedPoint = selectedIdx !== null ? chartData?.[selectedIdx] ?? null : null
  const activeInstanceId = (selectedPoint?.instance as string | undefined)
    ?? (detail?.[0] ? String(detail[0].instance ?? '') : '')
  const latest = activeInstanceId
    ? detail?.find(d => String(d.instance) === activeInstanceId) ?? detail?.[0] ?? null
    : detail?.[0] ?? null

  // Oletuksena korosta kuvaikkunan mittaus (uusin, kun ei valittu erikseen)
  const defaultActiveIdx = chartData?.findIndex((p) => String(p.instance) === activeInstanceId) ?? -1
  const activeIdx = selectedIdx ?? (defaultActiveIdx >= 0 ? defaultActiveIdx : undefined)

  // DICOM-kuva haetaan vain DICOM-näkymässä.
  const { data: dicomImg } = useQuery<ImageResponse>({
    queryKey: ['angio', 'image', activeInstanceId],
    queryFn: () => api.angioImage(activeInstanceId),
    enabled: !!activeInstanceId && imgSel === 'dicom', retry: false,
  })

  // Trendipisteen klikkaus: valitse/poista valinta.
  const handlePointClick = useCallback((idx: number) => {
    setSelectedIdx(prev => prev === idx ? null : idx)
  }, [])

  // Chip-arvot: valittu piste tai uusin
  // Sivupaneelin pikkuarvot valitusta pisteestä tai uusimmasta.
  const num = (v: unknown) => (typeof v === 'number' ? v : null)
  const chipUnif = num(selectedPoint?.percent_integral_uniformity ?? latest?.percent_integral_uniformity)
  const chipRois = num(selectedPoint?.num_contrast_rois_seen ?? latest?.num_contrast_rois_seen)
  const chipCnr = num(selectedPoint?.median_cnr ?? latest?.median_cnr)

  // Config-vetoiset metriikat + DB-toleranssit; verdiktiin vain toleranssilliset
  const { data: tolerances } = useTolerances()
  const metrics = buildMetrics('ANGIO', latest, (chartData ?? []) as Record<string, unknown>[], tolerances)
  const verdictMetrics = metrics.filter(hasTolerance)
  const v = deriveVerdict(verdictMetrics)
  const verdictDevice = {
    deviceId: String(latest?.station_name ?? dUnit),
    phantom: latest?.phantom_model ? String(latest.phantom_model) : undefined,
    measuredAt: formatDay(latest?.content_date as string | undefined),
    previousAt: formatDay(detail?.[1]?.content_date as string | undefined),
  }


  // Raportti-/AI-konteksti.
  const reportCtx: ReportContext = {
    sections: latest
      ? [
          { title: 'DICOM info', rows: [
            { label: 'Device', value: String(latest.station_name ?? dUnit) },
            { label: 'Institution', value: String(latest.institution_name ?? '') },
            { label: 'Phantom', value: String(latest.phantom_model ?? 'Leeds TOR-18') },
            { label: 'kVp', value: String(latest.kvp ?? '') },
            { label: 'mAs', value: String(latest.exposure_mAs ?? '') },
            { label: 'Model', value: String(latest.manufacturer_model_name ?? '') },
            { label: 'Date', value: verdictDevice.measuredAt ?? '' },
          ] },
          { title: 'Analysis results', rows: [
            { label: 'Uniformity (PIU)', value: `${rnd(chipUnif, 1)} %` },
            { label: 'Low-contrast detail (ROIs seen)', value: rnd(chipRois, 0) },
            { label: 'Median CNR', value: rnd(chipCnr) },
            { label: 'Verdict', value: `${VERDICT_FI[v.verdict]} (${v.pass}/${v.measured})` },
          ] },
        ]
      : [{ title: 'Device', rows: [{ label: 'Device', value: `${dUnit} (ANGIO)` }] }],
    failing: failingDetails(verdictMetrics),
    modality: String(latest?.modality ?? 'XA'),
    station: String(latest?.station_name ?? dUnit),
  }

  // Raportin kuvaliitteet: analyysikuvat (ei DICOM)
  const reportAttachments = activeInstanceId
    ? IMAGE_OPTIONS.filter((o) => o.key !== 'dicom').map((o) => ({
        key: o.key, label: o.label, url: api.angioAnalysisImageUrl(activeInstanceId, o.key),
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
            background: 'rgba(96,165,250,0.15)', color: '#93c5fd', border: '1px solid rgba(96,165,250,0.3)' }}>XA</span>
        </div>

        {/* Kuva yksi pudotusvalikko + kuvaikkuna */}
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

            {/* DICOM-näkymä: base64-kuva data-URL:na; muut: suora analyysikuva-URL. */}
            {imgSel === 'dicom' ? (
              dicomImg?.image
                ? <PngViewer key={activeInstanceId} src={`data:${dicomImg.mime ?? 'image/jpeg'};base64,${dicomImg.image}`} alt="DICOM" />
                : <div style={{ background: '#000', borderRadius: 6, aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: C.muted, fontSize: 11 }}>Image not available</span>
                  </div>
            ) : (
              // Kaaviokuville ei kirkkaus/kontrasti-säätöä.
              <PngViewer key={imgSel} src={api.angioAnalysisImageUrl(activeInstanceId, imgSel)} alt={imgSel}
                adjustable={!PLOT_KEYS.includes(imgSel)} />
            )}
          </div>
        )}

        {/* Mittausarvot + Laitetiedot */}
        <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
          <MetricValues metrics={metrics.filter((m) => m.value != null)} />
          {latest && (
            <DeviceInfo
              chips={[
                { label: 'Institution', value: String(latest.institution_name ?? '') },
                { label: 'Device', value: String(latest.station_name ?? '') },
                { label: 'Phantom', value: String(latest.phantom_model ?? 'Leeds TOR-18') },
                { label: 'kVp', value: String(latest.kvp ?? '') },
                { label: 'mAs', value: String(latest.exposure_mAs ?? '') },
                { label: 'Date', value: formatDay(latest.content_date as string | undefined) ?? '' },
              ]}
            />
          )}
        </div>

        {/* Verdiktti kompakti, vasemman paneelin alakulmassa */}
        {latest && <VerdictBar device={verdictDevice} metrics={verdictMetrics} compact card />}
      </div>
      )}

      {/* PÄÄALUE välilehdet (Analyysi / Kysy tekoälyltä / Raportoi ongelmasta) */}
      <MainArea
        onTabChange={setActiveTab}
        reportContext={reportCtx}
        reportAttachments={reportAttachments}
        breadcrumb={null}
      >
        {latest && (
          <PagedTrendPanel title="Measurement trends" metrics={metrics} perPage={3} chromeless dimTitle
            activeIndex={activeIdx} onSelect={handlePointClick} />
        )}
      </MainArea>
    </div>
  )
}
