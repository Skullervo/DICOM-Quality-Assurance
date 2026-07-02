// Laitesivujen jaetut tokenit + apurit (ei komponentteja — ks. components/qa/*).

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

// DICOM-päivä (YYYYMMDD) -> lyhyt "MM.DD" (trendien x-akseli).
export function formatDate(raw: string): string {
  if (!raw) return ''
  const s = raw.replace(/\D/g, '')
  if (s.length >= 8) return `${s.slice(4, 6)}.${s.slice(6, 8)}`
  return raw
}
