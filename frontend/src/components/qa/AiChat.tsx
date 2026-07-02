// Kysy tekoälyltä -välilehden chat. Tyyli yhtenäistetty Raportoi ongelmasta
// -välilehden kanssa (design-tokenit, samat kortti-/kenttä-/nappityylit).
// Käyttäjä voi valita analyysikuvia liitteeksi; nyt kuvat välitetään tekstiviittauksina
// kysymykseen (varsinainen vision = jatkokehitys, ks. ROADMAP).
import { useState } from 'react'
import { Check, Send } from 'lucide-react'
import { api } from '../../api/client'
import type { ReportAttachment } from './ReportTab'

const label: React.CSSProperties = { fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 6 }

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

  const hasAtt = usable.length > 0

  return (
    <div style={{ padding: 16, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{
        flex: 1, minHeight: 0, display: 'grid', gap: 16,
        gridTemplateColumns: hasAtt ? 'minmax(0, 1fr) 300px' : 'minmax(0, 1fr)',
      }}>
        {/* Vasen: keskustelu + syöte */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div style={label}>Konteksti</div>
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--sans)', fontSize: 13, lineHeight: 1.55, color: 'var(--text)', margin: 0 }}>
                  {context}
                </pre>
              </div>
            </div>

            {messages.map((m, i) => (
              <div key={i} style={{
                maxWidth: '85%', alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                borderRadius: 8, padding: '10px 12px', fontSize: 13, lineHeight: 1.5, color: 'var(--text)',
                background: m.role === 'user' ? 'color-mix(in srgb, var(--info) 12%, transparent)' : 'var(--surface-2)',
                border: m.role === 'user' ? '1px solid color-mix(in srgb, var(--info) 34%, transparent)' : '1px solid var(--border)',
              }}>
                {m.role === 'ai' && <span style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text-muted)' }}>Tekoäly</span>}
                <span style={{ whiteSpace: 'pre-wrap' }}>{m.text}</span>
                {m.imgs && m.imgs.length > 0 && (
                  <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end' }}>
                    {m.imgs.map((l) => (
                      <span key={l} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'color-mix(in srgb, var(--info) 15%, transparent)', color: 'var(--info)', border: '1px solid color-mix(in srgb, var(--info) 40%, transparent)' }}>
                        {l}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div style={{ alignSelf: 'flex-start', borderRadius: 8, padding: '10px 12px', fontSize: 13, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                Ladataan vastausta…
              </div>
            )}
          </div>

          {/* Syöte */}
          <div>
            <div style={label}>Kysymys</div>
            <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={2}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              style={{
                width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8,
                padding: 12, color: 'var(--text)', fontSize: 13.5, resize: 'none', outline: 'none',
                boxSizing: 'border-box', fontFamily: 'var(--sans)', lineHeight: 1.5,
              }}
              placeholder="Kirjoita kysymys…" />
          </div>
        </div>

        {/* Oikea: kuvaliitteet (sama valitsin kuin raporttivälilehdellä) */}
        {hasAtt && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
            <div style={label}>
              Liitä kuvia {selected.size > 0 && <span style={{ color: 'var(--info)' }}>({selected.size} valittu)</span>}
            </div>
            <div style={{ overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignContent: 'start' }}>
              {usable.map((a) => {
                const sel = selected.has(a.key)
                return (
                  <button key={a.key} onClick={() => toggle(a.key)} aria-pressed={sel} title={a.label}
                    style={{
                      position: 'relative', padding: 0, borderRadius: 8, overflow: 'hidden', cursor: 'pointer',
                      background: 'var(--surface-2)', textAlign: 'left',
                      border: `2px solid ${sel ? 'var(--info)' : 'var(--border)'}`,
                    }}>
                    <img src={a.url} alt={a.label} onError={() => markBroken(a.key)}
                      style={{ width: '100%', height: 68, objectFit: 'cover', display: 'block', background: '#000' }} />
                    <div style={{ fontSize: 10, padding: '3px 5px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {a.label}
                    </div>
                    {sel && (
                      <span style={{ position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: '50%', background: 'var(--info)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Check size={12} strokeWidth={3} aria-hidden />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Alapalkki: lähetä (sama sijainti/koko kuin raporttivälilehdellä) */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <button onClick={send} disabled={loading || !input.trim()} aria-label="Lähetä kysymys"
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            background: '#5b5bd6', border: 'none', color: '#fff', borderRadius: 8,
            padding: '10px 18px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
            opacity: loading || !input.trim() ? 0.6 : 1,
          }}>
          <Send size={15} aria-hidden />{loading ? 'Lähetetään…' : 'Lähetä'}
        </button>
      </div>
    </div>
  )
}
