// Statusmerkki: ikoni + väri + sana (ei koskaan pelkkä väri — brief osio 8).
import { CheckCircle2, AlertTriangle, XCircle, MinusCircle } from 'lucide-react'
import type { Status } from '../../lib/qa/types'

const MAP: Record<Status, { label: string; color: string; bg: string; Icon: typeof CheckCircle2 }> = {
  pass: { label: 'Hyväksytty', color: 'var(--pass)', bg: 'var(--pass-bg)', Icon: CheckCircle2 },
  warn: { label: 'Varoitus', color: 'var(--warn)', bg: 'var(--warn-bg)', Icon: AlertTriangle },
  fail: { label: 'Hylätty', color: 'var(--fail)', bg: 'var(--fail-bg)', Icon: XCircle },
  nodata: { label: 'Ei dataa', color: 'var(--neutral)', bg: 'transparent', Icon: MinusCircle },
}

export function StatusBadge({ status, compact = false }: { status: Status; compact?: boolean }) {
  const s = MAP[status]
  const Icon = s.Icon
  return (
    <span
      role="status"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, color: s.color,
        background: compact ? 'transparent' : s.bg,
        border: compact ? 'none' : `1px solid color-mix(in srgb, ${s.color} 33%, transparent)`,
        borderRadius: 999, padding: compact ? 0 : '2px 10px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
      }}
    >
      <Icon size={compact ? 15 : 14} strokeWidth={2.2} aria-hidden />
      {s.label}
    </span>
  )
}
