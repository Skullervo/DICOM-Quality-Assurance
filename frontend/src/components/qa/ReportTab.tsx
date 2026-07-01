// Raportoi ongelmasta -välilehti (brief osio 6.8): vakavuus + esitäytetty kuvaus + lähetä.
import { useState } from 'react'
import { Paperclip } from 'lucide-react'
import { api } from '../../api/client'

const SEVERITIES = ['Matala', 'Kohtalainen', 'Korkea']

export function ReportTab({ defaultText }: { defaultText: string }) {
  const [sev, setSev] = useState('Kohtalainen')
  const [text, setText] = useState(defaultText)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')

  async function send() {
    setStatus('loading')
    try {
      const d = await api.reportIssue(`[Vakavuus: ${sev}]\n${text}`)
      setStatus(d.status === 'ok' ? 'ok' : 'error')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 14, padding: 16 }}>
      <div>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 6 }}>Vakavuus</div>
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
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 6 }}>Kuvaus</div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6}
          style={{
            width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)',
            borderRadius: 8, padding: 12, color: 'var(--text)', fontSize: 13.5, resize: 'vertical',
            boxSizing: 'border-box', fontFamily: 'var(--sans)',
          }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <button disabled title="Liitteet: jatkokehitys"
          style={{
            display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface)',
            border: '1px solid var(--border)', color: 'var(--text-faint)', borderRadius: 8,
            padding: '8px 12px', fontSize: 13, cursor: 'not-allowed',
          }}>
          <Paperclip size={15} aria-hidden />Liitä kuvakaappaus
        </button>
        <button onClick={send} disabled={status === 'loading' || !text.trim()}
          style={{
            background: '#5b5bd6', border: 'none', color: '#fff', borderRadius: 8,
            padding: '10px 18px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
            opacity: status === 'loading' || !text.trim() ? 0.6 : 1,
          }}>
          {status === 'loading' ? 'Lähetetään…' : 'Lähetä raportti'}
        </button>
      </div>

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
