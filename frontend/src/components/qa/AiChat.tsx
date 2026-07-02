// Kysy tekoälyltä -välilehden chat. Konteksti (pyöristetty yhteenveto) tulee sivulta.
// Käyttäjä voi valita analyysikuvia liitteeksi (pikkukuvat inputin yllä); nyt kuvat
// välitetään tekstiviittauksina kysymykseen (varsinainen vision = jatkokehitys, ks. ROADMAP).
import { useState } from 'react'
import { Check } from 'lucide-react'
import { api } from '../../api/client'
import { C } from '../DeviceShared'
import type { ReportAttachment } from './ReportTab'

export function AiChat({ context, attachments = [] }: { context: string; attachments?: ReportAttachment[] }) {
  const [messages, setMessages] = useState<{ role: 'user' | 'ai'; text: string; imgs?: string[] }[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [broken, setBroken] = useState<Set<string>>(new Set())

  const toggle = (key: string) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })
  const markBroken = (key: string) => setBroken((prev) => new Set(prev).add(key))
  const usable = attachments.filter((a) => !broken.has(a.key))

  async function send() {
    const q = input.trim()
    if (!q) return
    const picked = attachments.filter((a) => selected.has(a.key) && !broken.has(a.key))
    const refText = picked.length ? `\n\n[Viittaan analyysikuviin: ${picked.map((a) => a.label).join(', ')}]` : ''
    setMessages(prev => [...prev, { role: 'user', text: q, imgs: picked.map((a) => a.label) }])
    setInput('')
    setSelected(new Set())
    setLoading(true)
    try {
      const d = await api.askAI(q + refText)
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
            {m.imgs && m.imgs.length > 0 && (
              <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end' }}>
                {m.imgs.map((label) => (
                  <span key={label} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 10, background: `${C.accent}26`, color: C.accent, border: `1px solid ${C.accent}4d` }}>
                    {label}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div style={{ borderRadius: 4, padding: 8, background: C.surface2, borderLeft: `2px solid ${C.accent}`, color: C.muted }}>
            Ladataan vastausta...
          </div>
        )}
      </div>

      {/* Kuvavalitsin — analyysikuvat pikkukuvina (sama kuin raporttivälilehdellä) */}
      {usable.length > 0 && (
        <div style={{ padding: '8px 12px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: C.muted }}>
            Liitä kuvia {selected.size > 0 && <span style={{ color: C.accent }}>({selected.size})</span>}
          </div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
            {usable.map((a) => {
              const sel = selected.has(a.key)
              return (
                <button key={a.key} onClick={() => toggle(a.key)} aria-pressed={sel} title={a.label}
                  style={{
                    position: 'relative', flexShrink: 0, width: 56, padding: 0, borderRadius: 6, overflow: 'hidden',
                    cursor: 'pointer', background: C.surface2, border: `2px solid ${sel ? C.accent : C.border}`,
                  }}>
                  <img src={a.url} alt={a.label} onError={() => markBroken(a.key)}
                    style={{ width: '100%', height: 42, objectFit: 'cover', display: 'block', background: '#000' }} />
                  {sel && (
                    <span style={{ position: 'absolute', top: 2, right: 2, width: 15, height: 15, borderRadius: '50%', background: C.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Check size={10} strokeWidth={3} aria-hidden />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

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
