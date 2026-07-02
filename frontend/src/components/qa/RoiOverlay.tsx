// Interaktiivinen ROI-kartta (brief 6.5): puhdas CTP404-leike + SVG-ROI-ympyrät
// statusvärillä, kytketty KPI-kortteihin (hover korostaa molempia suuntiin).
import type { Status } from '../../lib/qa/types'

export interface Roi { id: string; name: string; x: number; y: number; r: number }

const STATUS_VAR: Record<Status, string> = {
  pass: 'var(--pass)', warn: 'var(--warn)', fail: 'var(--fail)', nodata: 'var(--neutral)',
}

export function RoiOverlay({ src, rois, statusById, hoverId, onHover }: {
  src: string
  rois: Roi[]
  statusById: Record<string, Status>
  hoverId: string | null
  onHover: (id: string | null) => void
}) {
  return (
    <div style={{ position: 'relative', aspectRatio: '1', background: '#000', borderRadius: 6, overflow: 'hidden' }}>
      <img src={src} alt="CTP404-leike ROI-kartta" draggable={false}
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
      <svg viewBox="0 0 100 100" preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        {rois.map((roi) => {
          const color = STATUS_VAR[statusById[roi.id] ?? 'nodata']
          const active = hoverId === roi.id
          return (
            <g key={roi.id} style={{ cursor: 'pointer' }}
              onMouseEnter={() => onHover(roi.id)} onMouseLeave={() => onHover(null)}>
              {/* Läpinäkyvä isompi osumakohde helpottaa hoveria */}
              <circle cx={roi.x * 100} cy={roi.y * 100} r={roi.r * 100 + 1.5} fill="transparent" />
              <circle cx={roi.x * 100} cy={roi.y * 100} r={roi.r * 100}
                fill={active ? `color-mix(in srgb, ${color} 25%, transparent)` : 'none'}
                stroke={color} strokeWidth={active ? 1.4 : 0.7} vectorEffect="non-scaling-stroke" />
              {active && (
                <text x={roi.x * 100} y={roi.y * 100 - roi.r * 100 - 1.5} fill={color}
                  fontSize={3.4} fontWeight={700} textAnchor="middle" style={{ pointerEvents: 'none' }}>
                  {roi.name}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
