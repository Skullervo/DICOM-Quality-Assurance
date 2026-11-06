// =============================================================================
// components/qa/PagedTrendPanel.tsx — Sivutettu pino trendikäyriä
// =============================================================================
// Näyttää kerralla vain muutaman (oletus 3) ison trendikäyrän ja tarjoaa ‹ ›-
// napeilla loput. Näin keskialue täyttyy siististi eikä käyriä tule liikaa
// yhdellä kertaa. Jos jokin ROI on korostettuna (highlightId), paneeli hyppää
// automaattisesti sille sivulle, jotta ROI ja sitä vastaava käyrä näkyvät yhdessä.
// =============================================================================

// Sivutettu trendipaneeli: näyttää N (oletus 3) suurta, korkeutta täyttävää
// trendikäyrää kerralla pinossa; ‹ › selaa loput. Täyttää keskipaneelin tyhjän
// tilan eikä näytä liikaa käyriä yhtä aikaa. ROI-korostus (highlightId) hyppää
// automaattisesti oikealle sivulle, jotta ROI<->käyrä-kytkentä säilyy.
import { useState, type CSSProperties } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Metric } from '../../lib/qa/types'
import { TrendChart } from './TrendChart'

export function PagedTrendPanel({ title, metrics, perPage = 3, activeIndex, onSelect, highlightId, onHover, chromeless = false, dimTitle = false }: {
  title: string
  metrics: Metric[]
  perPage?: number
  activeIndex?: number
  onSelect?: (index: number) => void
  highlightId?: string | null
  onHover?: (id: string | null) => void
  chromeless?: boolean // riisu kortti-kehys (tausta/reunus/otsikkopalkki) jätä käyrät + otsikko + sivutus
  dimTitle?: boolean // himmennä käyräotsikot
}) {
  const [manualPage, setManualPage] = useState(0)  // käyttäjän ‹ ›-napeilla valitsema sivu
  if (metrics.length === 0) return null  // ei käyriä -> ei näytetä paneelia

  const pages = Math.ceil(metrics.length / perPage)  // sivujen kokonaismäärä
  // Jos korostettu mittari on toisella sivulla, näytä sen sivu (ei erillistä efektiä)
  const hlIdx = highlightId ? metrics.findIndex((m) => m.id === highlightId) : -1
  // Näytettävä sivu: korostetun mittarin sivu ohittaa manuaalivalinnan; rajataan sallittuun väliin.
  const page = Math.min(hlIdx >= 0 ? Math.floor(hlIdx / perPage) : manualPage, pages - 1)
  const start = page * perPage                       // tämän sivun ensimmäisen käyrän indeksi
  const shown = metrics.slice(start, start + perPage) // tällä sivulla näytettävät käyrät
  // Siirry sivulla eteen/taakse (d = +1/-1), pysyen sallitulla välillä.
  const go = (d: number) => setManualPage((p) => Math.max(0, Math.min(pages - 1, p + d)))

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
      ...(chromeless ? {} : { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }) }}>
      {/* Otsikko (vain kehyksellinen tila) ylhäällä */}
      {!chromeless && (
        <div style={{ flexShrink: 0, padding: '6px 12px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)',
          fontSize: 10, fontWeight: 600, letterSpacing: '.5px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{title}</div>
      )}
      {/* Käyrät */}
      <div style={{ flex: 1, minHeight: 0, padding: chromeless ? '0' : 12, display: 'grid',
        gridTemplateRows: `repeat(${shown.length}, minmax(0, 1fr))`, gap: 12 }}>
        {shown.map((m) => (
          <TrendChart key={m.id} metric={m} fill dimTitle={dimTitle} activeIndex={activeIndex} onSelect={onSelect}
            highlighted={highlightId === m.id} onHover={onHover} />
        ))}
      </div>
      {/* Sivutusvalitsin vain jos käyriä on enemmän kuin yhdelle sivulle mahtuu */}
      {pages > 1 && (
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: chromeless ? '8px 2px 0' : '8px 12px', ...(chromeless ? {} : { borderTop: '1px solid var(--border)' }) }}>
          <span className="tnum" style={{ fontSize: 11, color: 'var(--text-faint)' }}>{start + 1}–{start + shown.length} / {metrics.length}</span>
          <button onClick={() => go(-1)} disabled={page === 0} aria-label="Previous charts" style={pagerBtn(page === 0)}><ChevronLeft size={16} aria-hidden /></button>
          <button onClick={() => go(1)} disabled={page >= pages - 1} aria-label="Next charts" style={pagerBtn(page >= pages - 1)}><ChevronRight size={16} aria-hidden /></button>
        </div>
      )}
    </div>
  )
}

// Sivutusnappien tyyli; disabled-tilassa himmennetty eikä osoitinta.
const pagerBtn = (disabled: boolean): CSSProperties => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 24,
  borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)',
  color: 'var(--text-muted)', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
})
