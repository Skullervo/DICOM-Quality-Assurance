import { useState, type ReactNode } from 'react'
import { api } from '../api/client'

// Device detail color scheme — uses CSS vars for theme support
// These are used as inline styles where CSS vars can't easily apply
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

// Raw hex colors for inline style calculations that can't use CSS vars
export const CHex = {
  ok: '#52e3a0', warn: '#fbbf24', bad: '#fb7185', accent: '#00b4d8',
  muted: '#94a3b8', neutral: '#e2e8f0',
}

export function SlackForm({ defaultText }: { defaultText: string }) {
  const [text, setText] = useState(defaultText)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  async function send() {
    setStatus('loading')
    try {
      const d = await api.reportIssue(text)
      setStatus(d.status === 'ok' ? 'ok' : 'error')
    } catch { setStatus('error') }
  }
  return (
    <div style={{
      marginTop: 12, borderRadius: 8, padding: 12,
      background: C.surface, border: `1px solid ${C.border}`,
    }}>
      <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, color: C.muted }}>
        Raportoi ongelmasta
      </p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2}
        style={{
          width: '100%', fontSize: 11, borderRadius: 4, padding: 8,
          resize: 'none', marginBottom: 8, outline: 'none',
          background: C.surface2, color: C.neutral, border: `1px solid ${C.border}`,
          fontFamily: 'var(--font-family)',
        }}
        placeholder="Kuvaile havaittu ongelma..." />
      <button onClick={send} disabled={status === 'loading' || !text.trim()}
        style={{
          padding: '4px 12px', fontSize: 11, borderRadius: 4, color: 'white',
          border: 'none', cursor: 'pointer',
          background: status === 'loading' || !text.trim() ? '#374151' : 'var(--accent-blue)',
        }}>
        {status === 'loading' ? 'Lähetetään...' : 'Lähetä raportti'}
      </button>
      {status === 'ok' && <span style={{ marginLeft: 8, fontSize: 10, color: C.ok }}>Lähetetty ✓</span>}
      {status === 'error' && <span style={{ marginLeft: 8, fontSize: 10, color: C.bad }}>Epäonnistui</span>}
    </div>
  )
}

export function AiChat({ context }: { context: string }) {
  const [messages, setMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  async function send() {
    const q = input.trim()
    if (!q) return
    setMessages(prev => [...prev, { role: 'user', text: q }])
    setInput('')
    setLoading(true)
    try {
      const d = await api.askAI(q)
      setMessages(prev => [...prev, { role: 'ai', text: d.answer ?? d.error ?? 'Virhe' }])
    } catch {
      setMessages(prev => [...prev, { role: 'ai', text: 'Pyyntö epäonnistui' }])
    } finally { setLoading(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, padding: '12px 12px 0', color: C.muted }}>
        Kysy tekoälyltä
      </p>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11 }}>
        <div style={{ borderRadius: 4, padding: 8, background: C.surface2, borderLeft: `2px solid ${C.accent}` }}>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-family)', lineHeight: 1.6, color: C.neutral, margin: 0 }}>
            {context}
          </pre>
        </div>
        {messages.map((m, i) => (
          <div key={i} style={{
            borderRadius: 4, padding: 8,
            background: m.role === 'user' ? 'rgba(0,180,216,0.1)' : C.surface2,
            borderLeft: m.role === 'ai' ? `2px solid ${C.accent}` : undefined,
            textAlign: m.role === 'user' ? 'right' : 'left',
            color: C.neutral,
          }}>
            {m.role === 'ai' && <span style={{ fontSize: 9, display: 'block', marginBottom: 4, color: C.muted }}>Tekoäly</span>}
            <span style={{ whiteSpace: 'pre-wrap' }}>{m.text}</span>
          </div>
        ))}
        {loading && (
          <div style={{ borderRadius: 4, padding: 8, background: C.surface2, borderLeft: `2px solid ${C.accent}`, color: C.muted }}>
            Ladataan vastausta...
          </div>
        )}
      </div>

      <div style={{ padding: 12, display: 'flex', gap: 8, borderTop: `1px solid ${C.border}` }}>
        <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={2}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          style={{
            flex: 1, fontSize: 11, borderRadius: 4, padding: 8,
            resize: 'none', outline: 'none',
            background: C.surface2, color: C.neutral, border: `1px solid ${C.border}`,
            fontFamily: 'var(--font-family)',
          }}
          placeholder="Kirjoita kysymys..." />
        <button onClick={send} disabled={loading || !input.trim()}
          style={{
            padding: '0 8px', alignSelf: 'flex-end', borderRadius: 4,
            color: 'white', fontSize: 14, border: 'none', cursor: 'pointer',
            background: loading || !input.trim() ? '#374151' : C.accent,
            height: 28,
          }}>
          &#8594;
        </button>
      </div>
    </div>
  )
}

export function MetaRow({ label, value }: { label: string; value: string; small?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '6px 14px', borderBottom: `1px solid rgba(30,48,72,.5)`,
      transition: 'background 0.15s',
    }}
      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-card-hover)'}
      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
    >
      <span style={{ color: C.muted, fontSize: 11 }}>{label}</span>
      <span style={{
        fontFamily: 'monospace', fontSize: 11, color: C.neutral,
        textAlign: 'right', maxWidth: 150, overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {value || '—'}
      </span>
    </div>
  )
}

export function MetricChip({ label, value, unit, status, sub, decimals = 2 }: {
  label: string; value: number | null; unit: string; status: 'ok' | 'warn' | 'bad' | 'neutral'
  sub?: string; decimals?: number
}) {
  const colorVar = status === 'ok' ? C.ok : status === 'warn' ? C.warn : status === 'bad' ? C.bad : C.muted
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 5, padding: '3px 7px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase', color: C.muted }}>{label}</span>
        {sub && <span style={{ fontSize: 8, color: '#4b5563', whiteSpace: 'nowrap' }}>{sub}</span>}
      </div>
      <p style={{ fontSize: 14, fontFamily: 'monospace', fontWeight: 700, color: colorVar, margin: 0, lineHeight: 1.2 }}>
        {typeof value === 'number' ? value.toFixed(decimals) : '—'}
        {typeof value === 'number' && unit && <span style={{ fontSize: 9, fontWeight: 400, marginLeft: 3, color: C.muted }}>{unit}</span>}
      </p>
    </div>
  )
}

// Yhtenäinen mittaripaneeli: otsikkopalkki + reunallinen kortti.
// Solut erotellaan hiusviivoilla (MetricGrid gap + tausta) — ei sirpaleisia laatikoita.
export function MetricPanel({ title, right, children }: {
  title?: string; right?: ReactNode; children: ReactNode
}) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
      {title && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '4px 10px', borderBottom: `1px solid ${C.border}`, background: C.surface2,
        }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', color: C.muted }}>{title}</span>
          {right}
        </div>
      )}
      {children}
    </div>
  )
}

// Osio-otsikko paneelin sisään (esim. saman paneelin alla useita ryhmiä).
export function MetricSection({ label, right, first }: {
  label: string; right?: ReactNode; first?: boolean
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '3px 10px', background: C.surface2,
      borderBottom: `1px solid ${C.border}`,
      borderTop: first ? undefined : `1px solid ${C.border}`,
    }}>
      <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', color: C.muted }}>{label}</span>
      {right}
    </div>
  )
}

// Hiusviivoin eroteltu solukko: gap=1 + taustaväri näkyy rakojen läpi.
export function MetricGrid({ cols, children }: { cols: number; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 1, background: C.border }}>
      {children}
    </div>
  )
}

// Reunaton solu MetricGridin sisään.
export function MetricCell({ label, value, unit, status, nominal, decimals = 2 }: {
  label: string; value: number | null; unit?: string; status: 'ok' | 'warn' | 'bad' | 'neutral'
  nominal?: number; decimals?: number
}) {
  const color = status === 'ok' ? C.ok : status === 'warn' ? C.warn : status === 'bad' ? C.bad : C.neutral
  return (
    <div style={{ background: C.surface, padding: '5px 9px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase', color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
        {nominal != null && <span style={{ fontSize: 8, color: '#64748b', whiteSpace: 'nowrap' }}>nom {nominal}</span>}
      </div>
      <div style={{ fontSize: 15, fontFamily: 'monospace', fontWeight: 700, color, lineHeight: 1.25 }}>
        {typeof value === 'number' ? value.toFixed(decimals) : '—'}
        {typeof value === 'number' && unit && <span style={{ fontSize: 9, fontWeight: 400, color: C.muted, marginLeft: 3 }}>{unit}</span>}
      </div>
    </div>
  )
}

export function formatDate(raw: string): string {
  if (!raw) return ''
  const s = raw.replace(/\D/g, '')
  if (s.length >= 8) return `${s.slice(4, 6)}.${s.slice(6, 8)}`
  return raw
}
