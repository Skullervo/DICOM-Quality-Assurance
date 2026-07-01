// Mittaritaulukko (brief osio 6.4): lajiteltava, ongelmat ylös; tarkat luvut
// + inline-sparkline. Toimii myös käyrien saavutettavana tekstivaihtoehtona (osio 8).
import { useState } from 'react'
import { deriveStatus, hasTolerance, fmt, fmtDelta, limitText } from '../../lib/qa/status'
import type { Metric, Status } from '../../lib/qa/types'
import { StatusBadge } from './StatusBadge'
import { Sparkline } from './Sparkline'

const SEVERITY: Record<Status, number> = { fail: 0, warn: 1, nodata: 2, pass: 3 }
const ROW_BG: Partial<Record<Status, string>> = { fail: 'var(--fail-bg)', warn: 'var(--warn-bg)' }

type SortKey = 'status' | 'label' | 'delta'

function rowStatus(m: Metric): Status {
  if (m.value == null) return 'nodata'
  return hasTolerance(m) ? deriveStatus(m) : 'nodata'
}
function absDelta(m: Metric): number | null {
  return m.value != null && m.nominal != null ? Math.abs(m.value - m.nominal) : null
}

const TH: React.CSSProperties = {
  textAlign: 'left', fontSize: 10, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase',
  color: 'var(--text-muted)', padding: '6px 10px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
}
const TD: React.CSSProperties = { padding: '5px 10px', fontSize: 12.5, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }

export function MetricTable({ metrics, activeIndex, onSelect }: {
  metrics: Metric[]
  activeIndex?: number
  onSelect?: (index: number) => void
}) {
  const [sortKey, setSortKey] = useState<SortKey>('status')
  const [dir, setDir] = useState<1 | -1>(1)

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setDir((d) => (d === 1 ? -1 : 1))
    else { setSortKey(k); setDir(1) }
  }

  const sorted = [...metrics].sort((a, b) => {
    let c = 0
    if (sortKey === 'label') c = a.label.localeCompare(b.label, 'fi')
    else if (sortKey === 'delta') c = (absDelta(b) ?? -1) - (absDelta(a) ?? -1)
    else c = SEVERITY[rowStatus(a)] - SEVERITY[rowStatus(b)] || (absDelta(b) ?? -1) - (absDelta(a) ?? -1)
    return c * dir
  })

  const arrow = (k: SortKey) => (k === sortKey ? (dir === 1 ? ' ↓' : ' ↑') : '')

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--surface)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...TH, cursor: 'pointer' }} onClick={() => toggleSort('label')}>Metriikka{arrow('label')}</th>
            <th style={{ ...TH, cursor: 'pointer' }} onClick={() => toggleSort('status')}>Status{arrow('status')}</th>
            <th style={{ ...TH, textAlign: 'right' }}>Mitattu</th>
            <th style={{ ...TH, textAlign: 'right' }}>Nominaali</th>
            <th style={{ ...TH, textAlign: 'right', cursor: 'pointer' }} onClick={() => toggleSort('delta')}>Δ{arrow('delta')}</th>
            <th style={{ ...TH, textAlign: 'right' }}>Raja</th>
            <th style={{ ...TH, width: 120 }}>Trendi</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((m) => {
            const st = rowStatus(m)
            const d = m.value != null && m.nominal != null ? m.value - m.nominal : null
            return (
              <tr key={m.id} style={{ background: ROW_BG[st] ?? 'transparent' }}>
                <td style={{ ...TD, color: 'var(--text)' }}>{m.label}</td>
                <td style={TD}>{hasTolerance(m) || m.value == null ? <StatusBadge status={st} compact /> : <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>ei rajaa</span>}</td>
                <td className="num" style={{ ...TD, textAlign: 'right', color: 'var(--text)' }}>{fmt(m.value, m.precision)}{m.unit && <span style={{ color: 'var(--text-faint)' }}> {m.unit}</span>}</td>
                <td className="num" style={{ ...TD, textAlign: 'right', color: 'var(--text-muted)' }}>{fmt(m.nominal, m.precision)}</td>
                <td className="num" style={{ ...TD, textAlign: 'right', color: 'var(--text-muted)' }}>{d != null ? fmtDelta(d, m.precision) : '—'}</td>
                <td className="num" style={{ ...TD, textAlign: 'right', color: 'var(--text-faint)' }}>{limitText(m)}</td>
                <td style={{ ...TD, padding: '2px 10px' }}>
                  {m.history.length > 0
                    ? <Sparkline metric={m} activeIndex={activeIndex} onSelect={onSelect} height={30} />
                    : <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>—</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
