// =============================================================================
// components/qa/PngViewer.tsx — Valmiiden analyysi-PNG-kuvien katselin
// =============================================================================
// Näyttää palvelimen jo renderöimän PNG-kuvan (esim. MTF-käyrä, profiili,
// ROI-kartta) ja tarjoaa zoomin (rulla), panoroinnin (raahaus) ja valinnaisen
// kirkkaus/kontrasti-säädön. Säätö on pelkkä CSS-filtteri, EI aito HU-ikkunointi
// (kuvat ovat tavallisia 8-bittisiä PNG:itä). Kaaviokuville annetaan
// adjustable=false, jolloin kirkkaus/kontrasti-liukuja ei näytetä.
// =============================================================================

// Esirenderöityjen analyysikuvien katselin: zoom/pan + valinnainen harmaasävysäätö
// (kirkkaus/kontrasti CSS-filtterillä — kuvat ovat 8-bit PNG:itä, ei aitoa HU-W/L:ää).
// Kaaviokuville (scatter/käyrä/profiili) adjustable=false -> ei liukuja.
import { useState, useEffect, useRef, type CSSProperties } from 'react'
import { RotateCcw } from 'lucide-react'
import { C } from '../DeviceShared'

const sliderLabel: CSSProperties = { fontSize: 9, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-faint)' }

export function PngViewer({ src, alt, adjustable = true }: { src: string; alt: string; adjustable?: boolean }) {
  const [brightness, setBrightness] = useState(100)  // kirkkaus-% (CSS-filtteri)
  const [contrast, setContrast] = useState(100)      // kontrasti-% (CSS-filtteri)
  const [zoom, setZoom] = useState(1)                // zoom-kerroin
  const [pan, setPan] = useState({ x: 0, y: 0 })     // panorointisiirtymä
  const [dragging, setDragging] = useState(false)    // raahataanko parhaillaan
  const drag = useRef<{ x: number; y: number } | null>(null)  // raahauksen aloituskohta
  const containerRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef(1)
  const [failed, setFailed] = useState(false)  // true jos PNG ei latautunut (esim. mittaukselle ei analyysikuvaa)

  // Nollaa virhetila kun kuva (src) vaihtuu, jotta uusi kuva yritetään ladata uudestaan.
  useEffect(() => { setFailed(false) }, [src])

  // Rajaa panorointi niin että kuva pysyy aina peittämässä kuvaikkunan.
  const clampPan = (px: number, py: number, z: number) => {
    const el = containerRef.current
    if (!el) return { x: px, y: py }
    const mx = ((z - 1) * el.clientWidth) / 2
    const my = ((z - 1) * el.clientHeight) / 2
    return { x: Math.max(-mx, Math.min(mx, px)), y: Math.max(-my, Math.min(my, py)) }
  }

  // Rullazoomaus (ei-passiivinen kuuntelija, jotta sivu ei vieri kuvan päällä).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const nz = Math.min(6, Math.max(1, zoomRef.current - e.deltaY * 0.0015))  // rajaa 1..6
      zoomRef.current = nz
      setZoom(nz)
      setPan((p) => clampPan(p.x, p.y, nz))
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  // Raahauksen hiiritapahtumat (panorointi) ja nollaus — samaa logiikkaa kuin ImageViewerissä.
  const onDown = (e: React.MouseEvent) => { drag.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }; setDragging(true) }
  const onMove = (e: React.MouseEvent) => {
    if (!drag.current) return
    setPan(clampPan(e.clientX - drag.current.x, e.clientY - drag.current.y, zoom))
  }
  const endDrag = () => { drag.current = null; setDragging(false) }
  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }); zoomRef.current = 1 }

  // CSS-filtteri kirkkaudelle/kontrastille; ei lainkaan jos säätö pois käytöstä.
  const filter = adjustable ? `brightness(${brightness}%) contrast(${contrast}%)` : undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div
        ref={containerRef}
        onMouseDown={onDown} onMouseMove={onMove} onMouseUp={endDrag} onMouseLeave={endDrag}
        style={{ position: 'relative', background: '#000', borderRadius: 6, aspectRatio: '1', overflow: 'hidden', cursor: dragging ? 'grabbing' : 'grab' }}
      >
        {/* Jos kuva ei lataudu (esim. mittaukselle ei ole analyysikuvaa Siemens-
            fallback tai topogrammi), näytetään selkeä viesti mustan ikkunan sijaan. */}
        {failed ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: C.muted, fontSize: 12, textAlign: 'center', padding: 16 }}>
            Ei analyysikuvaa tälle mittaukselle
          </div>
        ) : (
          <img
            src={src} alt={alt} draggable={false}
            onError={() => setFailed(true)}
            style={{
              width: '100%', height: '100%', objectFit: 'contain', display: 'block',
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center', transition: dragging ? 'none' : 'transform .05s',
              filter, imageRendering: zoom > 2 ? 'pixelated' : 'auto',
            }}
          />
        )}
        {!failed && zoom > 1 && (
          <button onClick={reset} title="Reset zoom/pan"
            style={{ position: 'absolute', top: 6, right: 6, display: 'flex', alignItems: 'center', gap: 4,
              background: 'rgba(19,25,34,.85)', border: `1px solid ${C.border}`, borderRadius: 5,
              color: C.muted, fontSize: 10, padding: '3px 6px', cursor: 'pointer' }}>
            <RotateCcw size={11} aria-hidden /> {zoom.toFixed(1)}×
          </button>
        )}
      </div>

      {/* Kirkkaus/kontrasti-liukurit vain kun säätö on sallittu (esim. kuvat, ei kaaviot). */}
      {adjustable && (
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
      )}
    </div>
  )
}
