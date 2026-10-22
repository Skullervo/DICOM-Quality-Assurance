// =============================================================================
// components/qa/VerdictBar.tsx — Laitteen kokonaisverdiktti näkyvänä palkkina
// =============================================================================
// Analyysi-välilehden "sankarielementti": kertoo yhdellä silmäyksellä onko laite
// PASS / WARNING / FAIL / NO DATA. Verdiktti lasketaan kaikista mittareista
// (deriveVerdict, korkein vakavuus voittaa). Palkista on kaksi muotoa: iso
// täysleveä palkki (oletus) ja kompakti versio sivupaneeliin (compact/card).
// =============================================================================

// Verdikttipalkki — Analyysin sankarielementti (redesign-brief osio 6.1).
// Konsolidoi metriikoiden statukset: korkein vakavuus voittaa.
import { CheckCircle2, AlertTriangle, XCircle, MinusCircle } from 'lucide-react'
import { deriveVerdict } from '../../lib/qa/status'
import type { Metric, Status } from '../../lib/qa/types'

// Statuksen ulkoasu: näytettävä sana, väri, taustaväri ja ikoni.
const STATUS: Record<Status, { word: string; color: string; bg: string; Icon: typeof CheckCircle2 }> = {
  pass: { word: 'PASS', color: 'var(--pass)', bg: 'var(--pass-bg)', Icon: CheckCircle2 },
  warn: { word: 'WARNING', color: 'var(--warn)', bg: 'var(--warn-bg)', Icon: AlertTriangle },
  fail: { word: 'FAIL', color: 'var(--fail)', bg: 'var(--fail-bg)', Icon: XCircle },
  nodata: { word: 'NO DATA', color: 'var(--neutral)', bg: 'transparent', Icon: MinusCircle },
}

// Palkissa näytettävät laitteen perustiedot.
export interface VerdictDevice {
  deviceId: string
  phantom?: string
  measuredAt?: string
  previousAt?: string
}

export function VerdictBar({ device, metrics, compact = false, card = false }: { device: VerdictDevice; metrics: Metric[]; compact?: boolean; card?: boolean }) {
  // Laske verdiktti ja mittarien lukumäärät kussakin tilassa.
  const { verdict, measured, pass, warn, fail, nodata } = deriveVerdict(metrics)
  const s = STATUS[verdict]
  const Icon = s.Icon

  // Kokoa yhteenvetoteksti: "x/y rajoissa" + mahdolliset varoitukset/hylkäykset/ei dataa.
  const parts = [`${pass}/${measured} metrics within limits`]
  if (warn > 0) parts.push(`${warn} warnings`)
  if (fail > 0) parts.push(`${fail} failed`)
  if (nodata > 0) parts.push(`${nodata} no data`)

  // Lisätieto: fantomi + mittauspäivä (näytetään vain jos saatavilla).
  const meta = [device.phantom, device.measuredAt].filter(Boolean).join(' · ')

  // Kompakti muoto — vasemman paneelin alakulmaan (laitetiedot jo näkyvissä paneelissa).
  // card=true -> reunallinen kortti marginaaleilla; muuten täysleveä palkki yläreunuksella.
  if (compact) {
    // Kompaktin version kehys: card=true -> reunallinen kortti, muuten yläviivalla erotettu palkki.
    const frame: React.CSSProperties = card
      ? { margin: 10, borderRadius: 8, border: `1px solid color-mix(in srgb, ${s.color} 34%, transparent)`, padding: '10px 12px' }
      : { borderTop: `1px solid color-mix(in srgb, ${s.color} 34%, transparent)`, padding: '9px 14px' }
    return (
      <div
        role="status"
        style={{
          flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 3,
          background: s.bg, ...frame,
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: s.color }}>
          <Icon size={16} strokeWidth={2.2} aria-hidden />
          <span style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: '.02em' }}>{s.word}</span>
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{parts.join(' · ')}</span>
      </div>
    )
  }

  // Oletusmuoto: iso täysleveä palkki vasemmalla verdiktti+yhteenveto, oikealla laitetiedot.
  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 16, flexShrink: 0,
        background: s.bg, border: `1px solid color-mix(in srgb, ${s.color} 34%, transparent)`,
        borderRadius: 10, padding: '12px 16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: s.color }}>
          <Icon size={26} strokeWidth={2.2} aria-hidden />
          <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: '.02em' }}>{s.word}</span>
        </span>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{parts.join(' · ')}</span>
      </div>
      <div style={{ textAlign: 'right', fontSize: 13 }}>
        <div style={{ color: 'var(--text)' }}>
          <span style={{ fontWeight: 600 }}>{device.deviceId}</span>
          {meta && <span style={{ color: 'var(--text-faint)' }}> · {meta}</span>}
        </div>
        {/* Edellinen mittauspäivä näytetään vain jos tiedossa. */}
        {device.previousAt && (
          <div style={{ color: 'var(--text-faint)', fontSize: 12 }}>previous measurement: {device.previousAt}</div>
        )}
      </div>
    </div>
  )
}
