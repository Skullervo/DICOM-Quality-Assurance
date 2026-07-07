// Raportoi ongelmasta -välilehti (brief osio 6.8): vakavuus + raportoija +
// automaattinen konteksti (read-only laatikot) + vapaa kuvaus + lisätiedot +
// kuvaliitteet + lähetä. Kaksisarakkeinen (lomake | kuvavalinta) kun liitteitä on.
import { useState, type CSSProperties } from 'react'
import { Send, Check } from 'lucide-react'
import { api } from '../../api/client'

export type ReportAttachment = { key: string; label: string; url: string }
export type ReportContext = {
  fields: { label: string; value: string }[] // Laite, Mittaus, Verdiktti, Mittausarvot…
  failing?: string[] // rajojen ulkopuoliset mittarit
}

const SEVERITIES = ['Matala', 'Kohtalainen', 'Korkea']

const absUrl = (u: string) => {
  try { return new URL(u, window.location.origin).href } catch { return u }
}

const labelStyle: CSSProperties = { fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 6 }
const fieldStyle: CSSProperties = {
  flex: 1, minWidth: 0, background: 'var(--surface-2)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '8px 10px', color: 'var(--text)', fontSize: 13, outline: 'none',
  boxSizing: 'border-box', fontFamily: 'var(--sans)',
}
const textareaStyle: CSSProperties = {
  width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)',
  borderRadius: 8, padding: 12, color: 'var(--text)', fontSize: 13.5, resize: 'none',
  boxSizing: 'border-box', fontFamily: 'var(--sans)', lineHeight: 1.5,
}
const ctxBox: CSSProperties = { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', minWidth: 0 }
const ctxLabel: CSSProperties = { fontSize: 9.5, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 2 }
const ctxValue: CSSProperties = { fontSize: 13, color: 'var(--text)', wordBreak: 'break-word' }

export function ReportTab({ context, attachments = [] }: { context: ReportContext; attachments?: ReportAttachment[] }) {
  const [sev, setSev] = useState('Kohtalainen')
  const [kuvaus, setKuvaus] = useState('')
  const [extra, setExtra] = useState('')
  const [reporter, setReporter] = useState(() => localStorage.getItem('autoqad-reporter') || '')
  const [email, setEmail] = useState(() => localStorage.getItem('autoqad-reporter-email') || '')
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [broken, setBroken] = useState<Set<string>>(new Set())

  const onReporter = (v: string) => { setReporter(v); localStorage.setItem('autoqad-reporter', v) }
  const onEmail = (v: string) => { setEmail(v); localStorage.setItem('autoqad-reporter-email', v) }

  const toggle = (key: string) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })
  const markBroken = (key: string) => setBroken((prev) => new Set(prev).add(key))

  const usable = attachments.filter((a) => !broken.has(a.key))
  const hasAtt = usable.length > 0
  const failing = context.failing ?? []

  async function send() {
    setStatus('loading')
    const picked = attachments.filter((a) => selected.has(a.key) && !broken.has(a.key))
    const liitteet = picked.length
      ? `\n\nLiitteet:\n${picked.map((a) => a.url.startsWith('data:') ? `• ${a.label} (liitetty kuva)` : `• ${a.label}: ${absUrl(a.url)}`).join('\n')}`
      : ''
    const rep = (reporter.trim() || email.trim())
      ? `Raportoija: ${reporter.trim()}${email.trim() ? ` <${email.trim()}>` : ''}\n` : ''
    const ctx = context.fields.map((f) => `${f.label}: ${f.value}`).join('\n')
      + (failing.length ? `\nRajan ulkopuolella:\n${failing.map((x) => `  - ${x}`).join('\n')}` : '')
    const kuvausBlock = kuvaus.trim() ? `\n\nKuvaus:\n${kuvaus.trim()}` : ''
    const extraBlock = extra.trim() ? `\n\nLisätiedot:\n${extra.trim()}` : ''
    try {
      const d = await api.reportIssue(`[Vakavuus: ${sev}]\n${rep}${ctx}${kuvausBlock}${extraBlock}${liitteet}`)
      setStatus(d.status === 'ok' ? 'ok' : 'error')
    } catch {
      setStatus('error')
    }
  }

  const sendBtn = (
    <button onClick={send} disabled={status === 'loading'}
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        background: '#5b5bd6', border: 'none', color: '#fff', borderRadius: 8,
        padding: '10px 18px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
        opacity: status === 'loading' ? 0.6 : 1,
      }}>
      <Send size={15} aria-hidden />
      {status === 'loading' ? 'Lähetetään…' : 'Lähetä raportti'}
    </button>
  )

  return (
    <div style={{ padding: 16, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{
        flex: 1, minHeight: 0, display: 'grid', gap: 16,
        gridTemplateColumns: hasAtt ? 'minmax(0, 1fr) 300px' : 'minmax(0, 720px)',
        gridTemplateRows: 'minmax(0, 1fr)',
      }}>
        {/* Vasen: lomake (vierii tarvittaessa) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0, overflowY: 'auto', paddingRight: 4 }}>
          <div>
            <div style={labelStyle}>Vakavuus</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {SEVERITIES.map((x) => (
                <button key={x} onClick={() => setSev(x)}
                  style={{
                    flex: 1, background: sev === x ? 'var(--surface-2)' : 'var(--surface)',
                    border: `1px solid ${sev === x ? 'var(--info)' : 'var(--border)'}`,
                    color: 'var(--text)', borderRadius: 8, padding: '9px 0', fontSize: 13, cursor: 'pointer',
                  }}>
                  {x}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={labelStyle}>Raportoija</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={reporter} onChange={(e) => onReporter(e.target.value)} placeholder="Nimi" aria-label="Raportoijan nimi" style={fieldStyle} />
              <input value={email} onChange={(e) => onEmail(e.target.value)} type="email" placeholder="Sähköposti (valinnainen)" aria-label="Sähköposti" style={fieldStyle} />
            </div>
          </div>

          {/* Automaattinen konteksti — omat read-only laatikot */}
          <div>
            <div style={labelStyle}>Mittauksen tiedot</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {context.fields.map((f) => (
                <div key={f.label} style={ctxBox}>
                  <div style={ctxLabel}>{f.label}</div>
                  <div style={ctxValue}>{f.value}</div>
                </div>
              ))}
              {failing.length > 0 && (
                <div style={{ ...ctxBox, background: 'var(--warn-bg)', borderColor: 'color-mix(in srgb, var(--warn) 34%, transparent)' }}>
                  <div style={{ ...ctxLabel, color: 'var(--warn)' }}>Rajan ulkopuolella</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12.5, color: 'var(--text)' }}>
                    {failing.map((f) => <span key={f}>• {f}</span>)}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 120 }}>
            <div style={labelStyle}>Kuvaus</div>
            <textarea value={kuvaus} onChange={(e) => setKuvaus(e.target.value)}
              placeholder="Kuvaile ongelma omin sanoin…" style={{ ...textareaStyle, flex: 1, minHeight: 0 }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 100 }}>
            <div style={labelStyle}>Lisätiedot</div>
            <textarea value={extra} onChange={(e) => setExtra(e.target.value)}
              placeholder="Tehdyt toimenpiteet, muut havainnot…" style={{ ...textareaStyle, flex: 1, minHeight: 0 }} />
          </div>
        </div>

        {/* Oikea: kuvaliitteet (vain jos saatavilla) */}
        {hasAtt && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
              Liitä kuvia {selected.size > 0 && <span style={{ color: 'var(--info)' }}>({selected.size} valittu)</span>}
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignContent: 'start' }}>
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

      {status === 'ok' && (
        <div style={{ background: 'var(--pass-bg)', border: '1px solid var(--pass)', color: 'var(--pass)', borderRadius: 8, padding: '10px 12px', fontSize: 13 }}>
          Raportti lähetetty.
        </div>
      )}
      {status === 'error' && (
        <div style={{ background: 'var(--fail-bg)', border: '1px solid var(--fail)', color: 'var(--fail)', borderRadius: 8, padding: '10px 12px', fontSize: 13 }}>
          Lähetys epäonnistui.
        </div>
      )}
    </div>
  )
}
