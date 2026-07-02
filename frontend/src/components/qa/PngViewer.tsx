// Esirenderöityjen analyysikuvien katselin: zoom/pan + valinnainen harmaasävysäätö
// (kirkkaus/kontrasti CSS-filtterillä — kuvat ovat 8-bit PNG:itä, ei aitoa HU-W/L:ää).
// Kaaviokuville (scatter/käyrä/profiili) adjustable=false -> ei liukuja.
import { useState, useEffect, useRef, type CSSProperties } from 'react'
import { RotateCcw } from 'lucide-react'
import { C } from '../DeviceShared'

const sliderLabel: CSSProperties = { fontSize: 9, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-faint)' }

export function PngViewer({ src, alt, adjustable = true }: { src: string; alt: string; adjustable?: boolean }) {
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

  const filter = adjustable ? `brightness(${brightness}%) contrast(${contrast}%)` : undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div
        ref={containerRef}
        onMouseDown={onDown} onMouseMove={onMove} onMouseUp={endDrag} onMouseLeave={endDrag}
        style={{ position: 'relative', background: '#000', borderRadius: 6, aspectRatio: '1', overflow: 'hidden', cursor: dragging ? 'grabbing' : 'grab' }}
      >
        <img
          src={src} alt={alt} draggable={false}
          onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0' }}
          style={{
            width: '100%', height: '100%', objectFit: 'contain', display: 'block',
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center', transition: dragging ? 'none' : 'transform .05s',
            filter, imageRendering: zoom > 2 ? 'pixelated' : 'auto',
          }}
        />
        {zoom > 1 && (
          <button onClick={reset} title="Nollaa zoom/panorointi"
            style={{ position: 'absolute', top: 6, right: 6, display: 'flex', alignItems: 'center', gap: 4,
              background: 'rgba(19,25,34,.85)', border: `1px solid ${C.border}`, borderRadius: 5,
              color: C.muted, fontSize: 10, padding: '3px 6px', cursor: 'pointer' }}>
            <RotateCcw size={11} aria-hidden /> {zoom.toFixed(1)}×
          </button>
        )}
      </div>

      {adjustable && (
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
      )}
    </div>
  )
}
