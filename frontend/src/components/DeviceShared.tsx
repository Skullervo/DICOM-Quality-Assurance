// Laitesivujen jaetut tokenit + apurit (ei komponentteja — ks. components/qa/*).
import type { ReactNode } from 'react'

// Väripaletti inline-tyyleihin (viittaa index.css:n CSS-muuttujiin teematukea varten).
export const C = {
  bg: 'var(--bg-primary)',
  surface: 'var(--bg-secondary)',
  surface2: 'var(--bg-card)',
  border: 'var(--border-color)',
  accent: '#00b4d8',
  ok: 'var(--status-ok)',
  warn: 'var(--status-warn)',
  bad: 'var(--status-fail)',
  neutral: 'var(--text-primary)',
  muted: 'var(--text-secondary)',
}

// DICOM-päivä (YYYYMMDD) -> suomalainen täysi "DD.MM.YYYY" (tooltipit, valittu mittaus).
export function formatDate(raw: string): string {
  if (!raw) return ''
  const s = raw.replace(/\D/g, '')
  if (s.length >= 8) return `${s.slice(6, 8)}.${s.slice(4, 6)}.${s.slice(0, 4)}`
  return raw
}

// Kompakti muoto trendien x-akselille: "DD.MM.YY" (vuosi mukana, mahtuu tickiin).
export function formatDateAxis(raw: string): string {
  if (!raw) return ''
  const s = raw.replace(/\D/g, '')
  if (s.length >= 8) return `${s.slice(6, 8)}.${s.slice(4, 6)}.${s.slice(2, 4)}`
  return raw
}

// Renderöi metriikkatokenit (s_depth, U_cov, U_skew) oikeassa muodossa: '_'-merkin
// jälkeinen osa alaindeksinä -> s‹depth›, U‹cov›, U‹skew›. Muut labelit (ei '_')
// palautuvat sellaisenaan. Jaettu käyräotsikoiden ja mittausarvopaneelin kesken.
export function renderLabel(label: string): ReactNode[] {
  const re = /([A-Za-z])_([A-Za-z]+)/g
  const parts: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(label)) !== null) {
    if (m.index > last) parts.push(label.slice(last, m.index))
    parts.push(<span key={k++}>{m[1]}<sub>{m[2]}</sub></span>)
    last = m.index + m[0].length
  }
  if (last < label.length) parts.push(label.slice(last))
  return parts
}
