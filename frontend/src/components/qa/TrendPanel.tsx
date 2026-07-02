// Otsikoitu trendipaneeli: ryhmä metriikoiden suurennettuja trendikäyriä.
import type { Metric } from '../../lib/qa/types'
import { TrendChart } from './TrendChart'

export function TrendPanel({ title, metrics, cols = 2, activeIndex, onSelect }: {
  title: string
  metrics: Metric[]
  cols?: number
  activeIndex?: number
  onSelect?: (index: number) => void
}) {
  if (metrics.length === 0) return null
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', fontSize: 10, fontWeight: 600, letterSpacing: '.5px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
        {title}
      </div>
      <div style={{ padding: 12, display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: '14px 16px' }}>
        {metrics.map((m) => (
          <TrendChart key={m.id} metric={m} activeIndex={activeIndex} onSelect={onSelect} />
        ))}
      </div>
    </div>
  )
}
