// =============================================================================
// components/qa/AiChat.tsx — "Kysy tekoälyltä" -välilehden chat
// =============================================================================
// Antaa käyttäjän kysyä AI-avustajalta laitteen QA-tilasta. Kysymykseen
// liitetään automaattisesti laitteen konteksti (mittausarvot, rajat ylittäneet),
// jotta vastaus on osuva. Käyttäjä voi myös valita analyysikuvia liitteeksi;
// nykyään kuvat välitetään vain TEKSTIVIITTAUKSINA (varsinainen kuva-analyysi on
// jatkokehitystä). Varsinainen AI-kutsu menee api.askAI -> Go-backend -> OpenAI.
// =============================================================================

// Kysy tekoälyltä -välilehden chat. Tyyli yhtenäistetty Raportoi ongelmasta
// -välilehden kanssa (design-tokenit, samat kortti-/kenttä-/nappityylit).
// Käyttäjä voi valita analyysikuvia liitteeksi; nyt kuvat välitetään tekstiviittauksina
// kysymykseen (varsinainen vision = jatkokehitys, ks. ROADMAP).
import { useState } from 'react'
import { Check, Send } from 'lucide-react'
import { api } from '../../api/client'
import { ContextView } from './ContextView'
import { contextToText } from './contextText'
import type { ReportAttachment, ReportContext } from './ReportTab'

const label: React.CSSProperties = { fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 6 }

export function AiChat({ context, attachments = [] }: { context: ReportContext; attachments?: ReportAttachment[] }) {
  // Keskusteluhistoria: jokainen viesti on joko käyttäjän tai AI:n, valinnaisine kuvamaininnoin.
  const [messages, setMessages] = useState<{ role: 'user' | 'ai'; text: string; imgs?: string[] }[]>([])
  const [input, setInput] = useState('')          // syötekentän nykyteksti
  const [loading, setLoading] = useState(false)    // odotetaanko AI-vastausta
  const [selected, setSelected] = useState<Set<string>>(new Set())  // liitteeksi valitut kuvat (avaimet)
  const [broken, setBroken] = useState<Set<string>>(new Set())      // kuvat, joiden lataus epäonnistui

  // Valitsee/poistaa kuvan liitevalinnasta (toggle).
  const toggle = (key: string) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })
  // Merkitsee kuvan rikkinäiseksi, jotta sitä ei enää näytetä/tarjota.
  const markBroken = (key: string) => setBroken((prev) => new Set(prev).add(key))
  // Käyttökelpoiset liitteet = ne, joiden lataus ei ole epäonnistunut.
  const usable = attachments.filter((a) => !broken.has(a.key))

  // Lähettää kysymyksen AI:lle.
  async function send() {
    const q = input.trim()
    if (!q) return  // tyhjää kysymystä ei lähetetä
    // Liitteeksi valitut (ja ehjät) kuvat -> tekstiviittaus kysymykseen.
    const picked = attachments.filter((a) => selected.has(a.key) && !broken.has(a.key))
    const refText = picked.length ? `\n\n[Referring to analysis images: ${picked.map((a) => a.label).join(', ')}]` : ''
    // Lisää käyttäjän viesti heti näkyviin ja tyhjennä syöte/valinnat.
    setMessages(prev => [...prev, { role: 'user', text: q, imgs: picked.map((a) => a.label) }])
    setInput('')
    setSelected(new Set())
    setLoading(true)
    try {
      // Liitä laitteen konteksti kysymykseen, jotta AI tuntee mittauksen
      const d = await api.askAI(`Device context:\n${contextToText(context)}\n\nQuestion: ${q}${refText}`)
      // Näytä vastaus (tai virheviesti).
      setMessages(prev => [...prev, { role: 'ai', text: d.answer ?? d.error ?? 'Error' }])
    } catch {
      setMessages(prev => [...prev, { role: 'ai', text: 'Request failed' }])
    } finally { setLoading(false) }  // lopeta latausindikaattori oli lopputulos mikä tahansa
  }

  const hasAtt = usable.length > 0  // onko näytettäviä kuvaliitteitä (vaikuttaa asetteluun)

  const sendBtn = (
    <button onClick={send} disabled={loading || !input.trim()} aria-label="Send question"
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        background: '#5b5bd6', border: 'none', color: '#fff', borderRadius: 8,
        padding: '10px 18px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
        opacity: loading || !input.trim() ? 0.6 : 1,
      }}>
      <Send size={15} aria-hidden />{loading ? 'Sending…' : 'Send'}
    </button>
  )

  return (
    <div style={{ padding: 16, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{
        flex: 1, minHeight: 0, display: 'grid', gap: 16,
        gridTemplateColumns: hasAtt ? 'minmax(0, 1fr) 300px' : 'minmax(0, 1fr)',
        gridTemplateRows: 'minmax(0, 1fr)',
      }}>
        {/* Vasen: keskustelu + syöte */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Ylhäällä laitteen konteksti, jotta käyttäjä näkee mitä tietoa AI:lle lähtee. */}
            <ContextView context={context} />

            {/* Keskusteluviestit; käyttäjän viestit oikealle, AI vasemmalle. */}
            {messages.map((m, i) => (
              <div key={i} style={{
                maxWidth: '85%', alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                borderRadius: 8, padding: '10px 12px', fontSize: 13, lineHeight: 1.5, color: 'var(--text)',
                background: m.role === 'user' ? 'color-mix(in srgb, var(--info) 12%, transparent)' : 'var(--surface-2)',
                border: m.role === 'user' ? '1px solid color-mix(in srgb, var(--info) 34%, transparent)' : '1px solid var(--border)',
              }}>
                {m.role === 'ai' && <span style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text-muted)' }}>AI</span>}
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
                Loading response…
              </div>
            )}
          </div>

          {/* Syöte — vasemmassa sarakkeessa (sama leveys kuin konteksti) */}
          <div>
            <div style={label}>Question</div>
            {/* Enter lähettää, Shift+Enter tekee rivinvaihdon. */}
            <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={2}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              style={{
                width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8,
                padding: 12, color: 'var(--text)', fontSize: 13.5, resize: 'none', outline: 'none',
                boxSizing: 'border-box', fontFamily: 'var(--sans)', lineHeight: 1.5,
              }}
              placeholder="Type a question…" />
          </div>
        </div>

        {/* Oikea: kuvaliitteet (sama valitsin kuin raporttivälilehdellä) */}
        {hasAtt && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
            <div style={label}>
              Attach images {selected.size > 0 && <span style={{ color: 'var(--info)' }}>({selected.size} selected)</span>}
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'grid', gridTemplateColumns: usable.length <= 1 ? '1fr' : '1fr 1fr', gap: 8, alignContent: 'start' }}>
              {/* Kuvaruudukko; klikkaus valitsee/poistaa kuvan liitteistä. */}
              {usable.map((a) => {
                const sel = selected.has(a.key)  // onko tämä kuva valittuna
                return (
                  <button key={a.key} onClick={() => toggle(a.key)} aria-pressed={sel} title={a.label}
                    style={{
                      position: 'relative', padding: 0, borderRadius: 8, overflow: 'hidden', cursor: 'pointer',
                      background: 'var(--surface-2)', textAlign: 'left',
                      border: `2px solid ${sel ? 'var(--info)' : 'var(--border)'}`,
                    }}>
                    {/* Jos kuva ei lataudu, merkitään rikkinäiseksi ja piilotetaan jatkossa. */}
                    <img src={a.url} alt={a.label} onError={() => markBroken(a.key)}
                      style={{ width: '100%', height: usable.length <= 1 ? 200 : 120, objectFit: 'cover', display: 'block', background: '#000' }} />
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
            {/* Lähetä-nappi sarakkeen pohjalle (kuten raporttivälilehdellä) */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{sendBtn}</div>
          </div>
        )}
      </div>

      {/* Ilman liitteitä: lähetä alapalkissa */}
      {!hasAtt && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          {sendBtn}
        </div>
      )}
    </div>
  )
}
