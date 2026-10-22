// =============================================================================
// components/qa/RoiOverlay.tsx — Interaktiivinen ROI-kartta kuvan päällä
// =============================================================================
// Näyttää CT-leikkeen (esim. CTP404) ja piirtää sen päälle SVG-ympyröinä
// kiinnostavat alueet (ROI:t) statusvärein. ROI ja sitä vastaava KPI-kortti ovat
// kytketty: kun hiiri viedään jommankumman päälle (hoverId), molemmat korostuvat.
// Sisältää myös kirkkaus/kontrasti-säädön sekä zoomin ja panoroinnin — kuva ja
// ROI:t ovat samassa transform-kääreessä, joten ne skaalautuvat yhdessä.
// =============================================================================

// Interaktiivinen ROI-kartta (brief 6.5): puhdas CTP404-leike + SVG-ROI-ympyrät
// statusvärillä, kytketty KPI-kortteihin (hover korostaa molempia suuntiin).
// Harmaasävysäätö (kirkkaus/kontrasti) + zoom/pan (kuva ja ROI:t skaalautuvat yhdessä).
import { useState, useEffect, useRef, type CSSProperties } from 'react'
import { RotateCcw } from 'lucide-react'
import type { Status } from '../../lib/qa/types'

// Yksi ROI: tunniste, nimi ja sijainti/koko suhteellisina (0..1) kuvan mitoista.
export interface Roi { id: string; name: string; x: number; y: number; r: number }

// Statuksen ja värin kytkentä (teeman CSS-muuttujat).
const STATUS_VAR: Record<Status, string> = {
  pass: 'var(--pass)', warn: 'var(--warn)', fail: 'var(--fail)', nodata: 'var(--neutral)',
}
const sliderLabel: CSSProperties = { fontSize: 9, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-faint)' }

export function RoiOverlay({ src, rois, statusById, hoverId, onHover }: {
  src: string
  rois: Roi[]
  statusById: Record<string, Status>
  hoverId: string | null                 // nyt korostettuna oleva ROI (tai null)
  onHover: (id: string | null) => void   // kutsutaan kun hiiri menee ROI:n päälle/pois
}) {
  const [brightness, setBrightness] = useState(100)
  const [contrast, setContrast] = useState(100)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef(1)

  // Rajaa panorointi niin että kuva pysyy aina peittämässä kuvaikkunan.
  const clampPan = (px: number, py: number, z: number) => {
    const el = containerRef.current
    if (!el) return { x: px, y: py }
    const mx = ((z - 1) * el.clientWidth) / 2
    const my = ((z - 1) * el.clientHeight) / 2
    return { x: Math.max(-mx, Math.min(mx, px)), y: Math.max(-my, Math.min(my, py)) }
  }

  // Rullazoomaus (sama kuvio kuin PngViewer/ImageViewer).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const nz = Math.min(6, Math.max(1, zoomRef.current - e.deltaY * 0.0015))
      zoomRef.current = nz
      setZoom(nz)
      setPan((p) => clampPan(p.x, p.y, nz))
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  const onDown = (e: React.MouseEvent) => { drag.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }; setDragging(true) }
  const onMove = (e: React.MouseEvent) => {
    if (!drag.current) return
    setPan(clampPan(e.clientX - drag.current.x, e.clientY - drag.current.y, zoom))
  }
  const endDrag = () => { drag.current = null; setDragging(false) }
  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }); zoomRef.current = 1 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div
        ref={containerRef}
        onMouseDown={onDown} onMouseMove={onMove} onMouseUp={endDrag} onMouseLeave={endDrag}
        style={{ position: 'relative', aspectRatio: '1', background: '#000', borderRadius: 6, overflow: 'hidden', cursor: dragging ? 'grabbing' : 'grab' }}
      >
        {/* Kuva + ROI:t samassa transform-kääreessä -> skaalautuvat yhdessä */}
        <div style={{
          position: 'absolute', inset: 0,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: 'center center', transition: dragging ? 'none' : 'transform .05s',
        }}>
          <img src={src} alt="CTP404 slice ROI map" draggable={false}
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block',
              filter: `brightness(${brightness}%) contrast(${contrast}%)` }} />
          <svg viewBox="0 0 100 100" preserveAspectRatio="none"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            {/* Piirrä jokainen ROI ympyränä; aktiivinen (hover) korostetaan ja näytetään nimi. */}
            {rois.map((roi) => {
              const color = STATUS_VAR[statusById[roi.id] ?? 'nodata']  // väri statuksen mukaan
              const active = hoverId === roi.id  // onko tämä ROI korostettuna
              return (
                <g key={roi.id} style={{ cursor: 'pointer' }}
                  onMouseEnter={() => onHover(roi.id)} onMouseLeave={() => onHover(null)}>
                  {/* Läpinäkyvä hieman suurempi ympyrä laajentaa hover-osumapintaa. */}
                  <circle cx={roi.x * 100} cy={roi.y * 100} r={roi.r * 100 + 1.5} fill="transparent" />
                  {/* Varsinainen ROI-ympyrä; aktiivisena paksumpi reuna ja kevyt täyttö. */}
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
        {zoom > 1 && (
          <button onClick={reset} title="Reset zoom/pan"
            style={{ position: 'absolute', top: 6, right: 6, display: 'flex', alignItems: 'center', gap: 4,
              background: 'rgba(19,25,34,.85)', border: '1px solid var(--border)', borderRadius: 5,
              color: 'var(--text-muted)', fontSize: 10, padding: '3px 6px', cursor: 'pointer' }}>
            <RotateCcw size={11} aria-hidden /> {zoom.toFixed(1)}×
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', ...sliderLabel }}>
            <span>Brightness</span><span className="num">{brightness}%</span>
          </div>
          <input type="range" min={50} max={150} value={brightness}
            onChange={(e) => setBrightness(Number(e.target.value))} style={{ width: '100%' }} aria-label="Brightness" />
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', ...sliderLabel }}>
            <span>Contrast</span><span className="num">{contrast}%</span>
          </div>
          <input type="range" min={50} max={250} value={contrast}
            onChange={(e) => setContrast(Number(e.target.value))} style={{ width: '100%' }} aria-label="Contrast" />
        </div>
      </div>
    </div>
  )
}
