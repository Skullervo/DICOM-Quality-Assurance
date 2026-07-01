// KPI-stat-kortti (brief osio 6.2): label + iso arvo + statusmerkki + Δ/raja
// + sparkline + trendisuunta. Toleranssiton metriikka näytetään ilman statusväitettä.
import { ArrowUp, ArrowDown, ArrowRight } from 'lucide-react'
import { deriveStatus, hasTolerance, fmt, fmtDelta } from '../../lib/qa/status'
import type { Metric, Status } from '../../lib/qa/types'
import { StatusBadge } from './StatusBadge'
import { Sparkline } from './Sparkline'

function limitText(m: Metric): string {
  const p = m.precision
  const { lowerLimit: lo, upperLimit: hi, nominal: nom } = m
  if (nom != null && lo != null && hi != null && Math.abs(hi - nom - (nom - lo)) < 1e-9) return `raja ±${fmt(hi - nom, p)}`
  if (lo != null && hi != null) return `raja ${fmt(lo, p)}…${fmt(hi, p)}`
  if (hi != null) return `raja ≤ ${fmt(hi, p)}`
  if (lo != null) return `raja ≥ ${fmt(lo, p)}`
  return ''
}

export function MetricCard({ metric, activeIndex, onSelect }: {
  metric: Metric
  activeIndex?: number
  onSelect?: (index: number) => void
}) {
  const toleranced = hasTolerance(metric)
  const noData = metric.value == null
  const status: Status = noData ? 'nodata' : toleranced ? deriveStatus(metric) : 'nodata'
  const showBadge = noData || toleranced
  const delta = !noData && metric.nominal != null ? (metric.value as number) - metric.nominal : null

  const hist = metric.history
  const trend = hist.length >= 2 ? hist[hist.length - 1].value - hist[hist.length - 2].value : null
  const TrendIcon = trend == null ? ArrowRight : trend > 0 ? ArrowUp : trend < 0 ? ArrowDown : ArrowRight

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{metric.label}</span>
        {showBadge && <StatusBadge status={status} compact />}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span className="num" style={{ fontSize: 26, fontWeight: 600, color: 'var(--text)', lineHeight: 1 }}>{fmt(metric.value, metric.precision)}</span>
        {metric.unit && <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>{metric.unit}</span>}
      </div>

      <div className="num" style={{ fontSize: 12.5, color: 'var(--text-muted)', minHeight: 16 }}>
        {noData ? (
          'Ei mittausdataa'
        ) : (
          <>
            {delta != null && <>Δ {fmtDelta(delta, metric.precision)} {metric.unit} </>}
            <span style={{ color: 'var(--text-faint)' }}>{limitText(metric)}</span>
          </>
        )}
      </div>

      {noData || hist.length === 0 ? (
        <div style={{ height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--border)', borderRadius: 6, fontSize: 12, color: 'var(--text-faint)' }}>
          Ei historiaa
        </div>
      ) : (
        <Sparkline metric={metric} activeIndex={activeIndex} onSelect={onSelect} />
      )}

      {trend != null && !noData && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-faint)' }}>
          <TrendIcon size={14} aria-hidden />
          <span className="num">{fmtDelta(trend, metric.precision)} {metric.unit}</span>
          <span>vs. edellinen</span>
        </div>
      )}
    </div>
  )
}
