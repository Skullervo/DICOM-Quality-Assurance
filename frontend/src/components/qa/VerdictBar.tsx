// Verdikttipalkki — Analyysin sankarielementti (redesign-brief osio 6.1).
// Konsolidoi metriikoiden statukset: korkein vakavuus voittaa.
import { CheckCircle2, AlertTriangle, XCircle, MinusCircle } from 'lucide-react'
import { deriveVerdict } from '../../lib/qa/status'
import type { Metric, Status } from '../../lib/qa/types'

const STATUS: Record<Status, { word: string; color: string; bg: string; Icon: typeof CheckCircle2 }> = {
  pass: { word: 'HYVÄKSYTTY', color: 'var(--pass)', bg: 'var(--pass-bg)', Icon: CheckCircle2 },
  warn: { word: 'VAROITUS', color: 'var(--warn)', bg: 'var(--warn-bg)', Icon: AlertTriangle },
  fail: { word: 'HYLÄTTY', color: 'var(--fail)', bg: 'var(--fail-bg)', Icon: XCircle },
  nodata: { word: 'EI DATAA', color: 'var(--neutral)', bg: 'transparent', Icon: MinusCircle },
}

export interface VerdictDevice {
  deviceId: string
  phantom?: string
  measuredAt?: string
  previousAt?: string
}

export function VerdictBar({ device, metrics }: { device: VerdictDevice; metrics: Metric[] }) {
  const { verdict, measured, pass, warn, fail, nodata } = deriveVerdict(metrics)
  const s = STATUS[verdict]
  const Icon = s.Icon

  const parts = [`${pass}/${measured} mittaria rajoissa`]
  if (warn > 0) parts.push(`${warn} varoitusta`)
  if (fail > 0) parts.push(`${fail} hylättyä`)
  if (nodata > 0) parts.push(`${nodata} ei dataa`)

  const meta = [device.phantom, device.measuredAt].filter(Boolean).join(' · ')

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
        {device.previousAt && (
          <div style={{ color: 'var(--text-faint)', fontSize: 12 }}>edellinen mittaus: {device.previousAt}</div>
        )}
      </div>
    </div>
  )
}
