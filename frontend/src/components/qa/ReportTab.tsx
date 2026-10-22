// =============================================================================
// components/qa/ReportTab.tsx — "Raportoi ongelmasta" -välilehti (Slack-ilmoitus)
// =============================================================================
// Lomake, jolla käyttäjä lähettää ongelmailmoituksen Slackiin. Mukaan menee
// automaattisesti laitteen konteksti (mittausarvot, rajat ylittäneet) sekä
// käyttäjän valitsemat kuvaliitteet. Kentät: vakavuus, raportoija (nimi+email),
// vapaa kuvaus, lisätiedot. Lähetys menee api.reportIssue -> Go-backend, joka
// reitittää oikealle Slack-kanavalle context.modalityn perusteella.
//
// TÄSSÄ TIEDOSTOSSA määritellään myös tyypit ReportContext/ReportSection/
// ReportAttachment, joita AiChat ja MainArea käyttävät.
// =============================================================================

// Raportoi ongelmasta -välilehti (brief osio 6.8): vakavuus + raportoija +
// automaattinen konteksti (read-only laatikot) + vapaa kuvaus + lisätiedot +
// kuvaliitteet + lähetä. Kaksisarakkeinen (lomake | kuvavalinta) kun liitteitä on.
import { useState, type CSSProperties } from 'react'
import { Send, Check } from 'lucide-react'
import { api } from '../../api/client'
import { ContextView } from './ContextView'
import { contextToText } from './contextText'

import type { FailingItem } from '../../lib/qa/status'

// Yksi valittava kuvaliite: avain, näyttönimi ja kuvan URL.
export type ReportAttachment = { key: string; label: string; url: string }
// Yksi kontekstiosio: otsikko + "label: value" -rivit.
export type ReportSection = { title: string; rows: { label: string; value: string }[] }
// Koko laitteen tilakonteksti, joka liitetään raporttiin/AI-kysymykseen.
export type ReportContext = {
  sections: ReportSection[] // esim. DICOM-tiedot, Analyysitulokset — tiiviinä taulukkoina
  failing?: FailingItem[] // rajojen ulkopuoliset mittarit (rakenteisesti)
  modality?: string // Slack-reititys backendissä (US / CR / DX / CT)
  station?: string // laitteen tunnus (lisätään viestin alkuun)
}

// Valittavat vakavuustasot.
const SEVERITIES = ['Low', 'Moderate', 'High']

// Tekee suhteellisesta URL:stä absoluuttisen (jotta Slack-viestin linkki toimii).
const absUrl = (u: string) => {
  try { return new URL(u, window.location.origin).href } catch { return u }
}

const labelStyle: CSSProperties = { fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 6 }
const fieldStyle: CSSProperties = {
  flex: 1, minWidth: 0, background: 'transparent', border: '1px solid var(--border)',
  borderRadius: 8, padding: '8px 10px', color: 'var(--text)', fontSize: 13, outline: 'none',
  boxSizing: 'border-box', fontFamily: 'var(--sans)',
}
const textareaStyle: CSSProperties = {
  width: '100%', background: 'transparent', border: '1px solid var(--border)',
  borderRadius: 8, padding: 12, color: 'var(--text)', fontSize: 13.5, resize: 'none',
  boxSizing: 'border-box', fontFamily: 'var(--sans)', lineHeight: 1.5,
}

export function ReportTab({ context, attachments = [] }: { context: ReportContext; attachments?: ReportAttachment[] }) {
  const [sev, setSev] = useState('Moderate')   // valittu vakavuus (oletus keskitaso)
  const [kuvaus, setKuvaus] = useState('')     // vapaa ongelmakuvaus
  const [extra, setExtra] = useState('')       // lisätiedot
  // Raportoijan nimi ja email muistetaan selaimessa seuraavaa kertaa varten.
  const [reporter, setReporter] = useState(() => localStorage.getItem('autoqad-reporter') || '')
  const [email, setEmail] = useState(() => localStorage.getItem('autoqad-reporter-email') || '')
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')  // lähetyksen tila
  const [selected, setSelected] = useState<Set<string>>(new Set())  // liitteeksi valitut kuvat
  const [broken, setBroken] = useState<Set<string>>(new Set())      // latausvirheelliset kuvat

  // Nimi/email tallennetaan samalla localStorageen (muistetaan jatkossa).
  const onReporter = (v: string) => { setReporter(v); localStorage.setItem('autoqad-reporter', v) }
  const onEmail = (v: string) => { setEmail(v); localStorage.setItem('autoqad-reporter-email', v) }

  // Valitsee/poistaa kuvan liitteistä.
  const toggle = (key: string) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })
  const markBroken = (key: string) => setBroken((prev) => new Set(prev).add(key))  // merkitse kuva rikkinäiseksi

  const usable = attachments.filter((a) => !broken.has(a.key))  // ehjät liitteet
  const hasAtt = usable.length > 0  // onko liitteitä (vaikuttaa asetteluun)

  // Kokoaa raporttiviestin tekstistä ja lähettää sen backendille.
  async function send() {
    setStatus('loading')
    // Valitut ehjät kuvat; data:-URL ei ole linkitettävä, muut linkkeinä.
    const picked = attachments.filter((a) => selected.has(a.key) && !broken.has(a.key))
    const liitteet = picked.length
      ? `\n\nAttachments:\n${picked.map((a) => a.url.startsWith('data:') ? `• ${a.label} (attached image)` : `• ${a.label}: ${absUrl(a.url)}`).join('\n')}`
      : ''
    // Raportoija-rivi vain jos nimi tai email annettu.
    const rep = (reporter.trim() || email.trim())
      ? `Reporter: ${reporter.trim()}${email.trim() ? ` <${email.trim()}>` : ''}\n` : ''
    const ctx = contextToText(context)  // laitteen konteksti tekstinä
    const kuvausBlock = kuvaus.trim() ? `\n\nDescription:\n${kuvaus.trim()}` : ''
    const extraBlock = extra.trim() ? `\n\nAdditional info:\n${extra.trim()}` : ''
    try {
      // Lähetä koottu viesti; modality/station ohjaavat Slack-kanavan valintaa backendissä.
      const d = await api.reportIssue(
        `[Severity: ${sev}]\n${rep}${ctx}${kuvausBlock}${extraBlock}${liitteet}`,
        { modality: context.modality, station: context.station },
      )
      setStatus(d.status === 'ok' ? 'ok' : 'error')  // näytä onnistuminen/virhe
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
      {status === 'loading' ? 'Sending…' : 'Send report'}
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
            <div style={labelStyle}>Severity</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {SEVERITIES.map((x) => (
                <button key={x} onClick={() => setSev(x)}
                  style={{
                    flex: 1, background: 'transparent',
                    border: `1px solid ${sev === x ? 'var(--info)' : 'var(--border)'}`,
                    color: sev === x ? 'var(--info)' : 'var(--text)', borderRadius: 8, padding: '9px 0', fontSize: 13, cursor: 'pointer',
                  }}>
                  {x}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={labelStyle}>Reporter</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={reporter} onChange={(e) => onReporter(e.target.value)} placeholder="Name" aria-label="Reporter name" style={fieldStyle} />
              <input value={email} onChange={(e) => onEmail(e.target.value)} type="email" placeholder="Email (optional)" aria-label="Email" style={fieldStyle} />
            </div>
          </div>

          {/* Automaattinen konteksti — tiiviit taulukot + Rajan ulkopuolella (jaettu ContextView) */}
          <ContextView context={context} />

          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 120 }}>
            <div style={labelStyle}>Description</div>
            <textarea value={kuvaus} onChange={(e) => setKuvaus(e.target.value)}
              placeholder="Describe the issue in your own words…" style={{ ...textareaStyle, flex: 1, minHeight: 0 }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 100 }}>
            <div style={labelStyle}>Additional info</div>
            <textarea value={extra} onChange={(e) => setExtra(e.target.value)}
              placeholder="Actions taken, other observations…" style={{ ...textareaStyle, flex: 1, minHeight: 0 }} />
          </div>
        </div>

        {/* Oikea: kuvaliitteet (vain jos saatavilla) */}
        {hasAtt && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
              Attach images {selected.size > 0 && <span style={{ color: 'var(--info)' }}>({selected.size} selected)</span>}
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'grid', gridTemplateColumns: usable.length <= 1 ? '1fr' : '1fr 1fr', gap: 8, alignContent: 'start' }}>
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

      {/* Onnistumis-/virheilmoitus lähetyksen jälkeen. */}
      {status === 'ok' && (
        <div style={{ background: 'var(--pass-bg)', border: '1px solid var(--pass)', color: 'var(--pass)', borderRadius: 8, padding: '10px 12px', fontSize: 13 }}>
          Report sent.
        </div>
      )}
      {status === 'error' && (
        <div style={{ background: 'var(--fail-bg)', border: '1px solid var(--fail)', color: 'var(--fail)', borderRadius: 8, padding: '10px 12px', fontSize: 13 }}>
          Sending failed.
        </div>
      )}
    </div>
  )
}
