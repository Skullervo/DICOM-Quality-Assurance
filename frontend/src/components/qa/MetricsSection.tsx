// Mittarit — näkymävalitsin: KPI-kortit (oletus) tai lajiteltava taulukko.
// Sama data, kaksi esitystä (ei yhtäaikaista tuplausta).
import { useState } from 'react'
import { LayoutGrid, Table2 } from 'lucide-react'
import type { Metric } from '../../lib/qa/types'
import { MetricCard } from './MetricCard'
import { MetricTable } from './MetricTable'

type View = 'cards' | 'table'
const OPTS: { id: View; label: string; Icon: typeof LayoutGrid }[] = [
  { id: 'cards', label: 'Kortit', Icon: LayoutGrid },
  { id: 'table', label: 'Taulukko', Icon: Table2 },
]

export function MetricsSection({ metrics, activeIndex, onSelect }: {
  metrics: Metric[]
  activeIndex?: number
  onSelect?: (index: number) => void
}) {
  const [view, setView] = useState<View>('cards')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div role="tablist" aria-label="Mittarinäkymä" style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
        {OPTS.map(({ id, label, Icon }) => {
          const active = view === id
          return (
            <button key={id} role="tab" aria-selected={active} onClick={() => setView(id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer',
                padding: '4px 10px', borderRadius: 6,
                background: active ? 'var(--surface-2)' : 'transparent',
                color: active ? 'var(--text)' : 'var(--text-muted)',
                border: `1px solid ${active ? 'var(--border-strong)' : 'var(--border)'}`,
              }}>
              <Icon size={14} aria-hidden />{label}
            </button>
          )
        })}
      </div>

      {view === 'cards' ? (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          {metrics.map((m) => (
            <MetricCard key={m.id} metric={m} activeIndex={activeIndex} onSelect={onSelect} />
          ))}
        </div>
      ) : (
        <MetricTable metrics={metrics} activeIndex={activeIndex} onSelect={onSelect} />
      )}
    </div>
  )
}
