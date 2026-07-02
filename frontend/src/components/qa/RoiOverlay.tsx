// Interaktiivinen ROI-kartta (brief 6.5): puhdas CTP404-leike + SVG-ROI-ympyrät
// statusvärillä, kytketty KPI-kortteihin (hover korostaa molempia suuntiin).
// Harmaasävysäätö (kirkkaus/kontrasti) CSS-filtterillä kuvaan (ei ROI-ympyröihin).
import { useState, type CSSProperties } from 'react'
import type { Status } from '../../lib/qa/types'

export interface Roi { id: string; name: string; x: number; y: number; r: number }

const STATUS_VAR: Record<Status, string> = {
  pass: 'var(--pass)', warn: 'var(--warn)', fail: 'var(--fail)', nodata: 'var(--neutral)',
}
const sliderLabel: CSSProperties = { fontSize: 9, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-faint)' }

export function RoiOverlay({ src, rois, statusById, hoverId, onHover }: {
  src: string
  rois: Roi[]
  statusById: Record<string, Status>
  hoverId: string | null
  onHover: (id: string | null) => void
}) {
  const [brightness, setBrightness] = useState(100)
  const [contrast, setContrast] = useState(100)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ position: 'relative', aspectRatio: '1', background: '#000', borderRadius: 6, overflow: 'hidden' }}>
        <img src={src} alt="CTP404-leike ROI-kartta" draggable={false}
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block',
            filter: `brightness(${brightness}%) contrast(${contrast}%)` }} />
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', ...sliderLabel }}>
            <span>Kirkkaus</span><span className="num">{brightness}%</span>
          </div>
          <input type="range" min={50} max={150} value={brightness}
            onChange={(e) => setBrightness(Number(e.target.value))} style={{ width: '100%' }} aria-label="Kirkkaus" />
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', ...sliderLabel }}>
            <span>Kontrasti</span><span className="num">{contrast}%</span>
          </div>
          <input type="range" min={50} max={250} value={contrast}
            onChange={(e) => setContrast(Number(e.target.value))} style={{ width: '100%' }} aria-label="Kontrasti" />
        </div>
      </div>
    </div>
  )
}
