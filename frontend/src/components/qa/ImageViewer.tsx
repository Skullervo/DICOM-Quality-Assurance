// CT DICOM-katselin (brief 6.5, osittainen): suurennettu leike, palvelinpuolen
// Window/Level (Orthanc /rendered), viipaleselailu, zoom & pan. ROI-overlayt: 6b-2.
// Zoom/pan nollautuu instanssin vaihtuessa remountilla (key={instance} kutsujassa).
import { useState, useEffect, useRef, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RotateCcw } from 'lucide-react'
import { api } from '../../api/client'
import { C } from '../DeviceShared'

const sliderLabel: CSSProperties = { fontSize: 9, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-faint)' }

export function ImageViewer({ instance }: { instance: string }) {
  const { data: meta } = useQuery({
    queryKey: ['ct', 'series-meta', instance],
    queryFn: () => api.ctSeriesMeta(instance),
    enabled: !!instance,
  })

  // Käyttäjän säädöt (null = käytä sarjan oletusta)
  const [slice, setSlice] = useState<number | null>(null)
  const [wc, setWc] = useState<number | null>(null)
  const [ww, setWw] = useState<number | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef(1)

  const effSlice = slice ?? meta?.defaultSlice ?? 0
  const effWc = wc ?? (meta ? Number(meta.windowCenter) || 40 : 40)
  const effWw = ww ?? (meta ? Number(meta.windowWidth) || 400 : 400)

  // Debounce W/L + viipale -> kuvapyyntö (Orthanc renderöi palvelinpuolella)
  const [q, setQ] = useState({ slice: 0, wc: 40, ww: 400 })
  useEffect(() => {
    const t = setTimeout(() => setQ({ slice: effSlice, wc: Math.round(effWc), ww: Math.round(effWw) }), 130)
    return () => clearTimeout(t)
  }, [effSlice, effWc, effWw])

  // Rajaa panorointi niin että kuva pysyy aina peittämässä kuvaikkunan.
  const clampPan = (px: number, py: number, z: number) => {
    const el = containerRef.current
    if (!el) return { x: px, y: py }
    const mx = ((z - 1) * el.clientWidth) / 2
    const my = ((z - 1) * el.clientHeight) / 2
    return { x: Math.max(-mx, Math.min(mx, px)), y: Math.max(-my, Math.min(my, py)) }
  }

  // Rulla zoomaa — ei-passiivinen kuuntelija, jotta preventDefault estää paneelin vierityksen
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
  }, [meta]) // uudelleen kun kuvaikkuna renderöityy (meta latautuu)

  const onDown = (e: React.MouseEvent) => { drag.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }; setDragging(true) }
  const onMove = (e: React.MouseEvent) => {
    if (!drag.current) return
    setPan(clampPan(e.clientX - drag.current.x, e.clientY - drag.current.y, zoom))
  }
  const endDrag = () => { drag.current = null; setDragging(false) }
  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }); zoomRef.current = 1 }

  if (!meta) {
    return (
      <div style={{ background: '#000', borderRadius: 6, aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 10, color: C.muted }}>Loading image…</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div
        ref={containerRef}
        onMouseDown={onDown} onMouseMove={onMove} onMouseUp={endDrag} onMouseLeave={endDrag}
        style={{
          position: 'relative', background: '#000', borderRadius: 6, aspectRatio: '1', overflow: 'hidden',
          cursor: dragging ? 'grabbing' : 'grab',
        }}
      >
        <img
          src={api.ctSeriesImageUrl(instance, q.slice, q.wc, q.ww)}
          alt={`CT slice ${q.slice + 1}/${meta.sliceCount}`}
          draggable={false}
          style={{
            width: '100%', height: '100%', objectFit: 'contain', display: 'block',
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center', transition: dragging ? 'none' : 'transform .05s',
            imageRendering: zoom > 2 ? 'pixelated' : 'auto',
          }}
        />
        {zoom > 1 && (
          <button onClick={reset} title="Reset zoom/pan"
            style={{ position: 'absolute', top: 6, right: 6, display: 'flex', alignItems: 'center', gap: 4,
              background: 'rgba(19,25,34,.85)', border: `1px solid ${C.border}`, borderRadius: 5,
              color: C.muted, fontSize: 10, padding: '3px 6px', cursor: 'pointer' }}>
            <RotateCcw size={11} aria-hidden /> {zoom.toFixed(1)}×
          </button>
        )}
      </div>

      {/* Viipaleselailu */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', ...sliderLabel }}>
          <span>Slice</span><span className="num">{effSlice + 1} / {meta.sliceCount}</span>
        </div>
        <input type="range" min={0} max={meta.sliceCount - 1} value={effSlice}
          onChange={(e) => setSlice(Number(e.target.value))} style={{ width: '100%' }} aria-label="Slice" />
      </div>

      {/* Window/Level */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', ...sliderLabel }}>
            <span>Level (WC)</span><span className="num">{Math.round(effWc)}</span>
          </div>
          <input type="range" min={-1000} max={1000} value={effWc}
            onChange={(e) => setWc(Number(e.target.value))} style={{ width: '100%' }} aria-label="Window center" />
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', ...sliderLabel }}>
            <span>Width (WW)</span><span className="num">{Math.round(effWw)}</span>
          </div>
          <input type="range" min={1} max={3000} value={effWw}
            onChange={(e) => setWw(Number(e.target.value))} style={{ width: '100%' }} aria-label="Window width" />
        </div>
      </div>
    </div>
  )
}
