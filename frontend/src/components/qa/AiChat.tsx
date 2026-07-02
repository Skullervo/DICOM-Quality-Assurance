// Kysy tekoälyltä -välilehden chat. Konteksti (pyöristetty yhteenveto) tulee sivulta.
import { useState } from 'react'
import { api } from '../../api/client'
import { C } from '../DeviceShared'

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
