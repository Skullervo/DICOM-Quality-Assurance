// Pääalueen välilehti-runko (brief osio 5): Analyysi · Kysy tekoälyltä · Raportoi ongelmasta.
// Pysyvä vasen paneeli on tämän ulkopuolella (näkyy kaikilla välilehdillä).
import { useState, type ReactNode } from 'react'
import { BarChart3, Sparkles, Flag } from 'lucide-react'
import { AiChat } from './AiChat'
import { ReportTab, type ReportAttachment, type ReportContext } from './ReportTab'

type TabId = 'analyysi' | 'ai' | 'raportti'
const TABS: { id: TabId; label: string; Icon: typeof BarChart3 }[] = [
  { id: 'analyysi', label: 'Analyysi', Icon: BarChart3 },
  { id: 'ai', label: 'Kysy tekoälyltä', Icon: Sparkles },
  { id: 'raportti', label: 'Raportoi ongelmasta', Icon: Flag },
]

export function MainArea({ breadcrumb, aiContext, reportContext, reportAttachments, children }: {
  breadcrumb: ReactNode
  aiContext: string
  reportContext: ReportContext // raportin automaattinen konteksti (read-only laatikot)
  reportAttachments?: ReportAttachment[] // valittavat kuvaliitteet raporttiin
  children: ReactNode // Analyysi-välilehden sisältö (verdiktti + KPI + trendit)
}) {
  const [tab, setTab] = useState<TabId>('analyysi')
  return (
    <main style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
      {/* Kiinteä 46px korkeus -> ylin jakoviiva kohdistuu vasemman paneelin otsikkoriviin */}
      <div style={{ height: 46, boxSizing: 'border-box', padding: '0 16px', display: 'flex', alignItems: 'stretch', flexShrink: 0 }}>
        {/* Välilehdet vasemmalle, breadcrumb samalle riville oikeaan laitaan (säästää pystytilaa) */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 16, borderBottom: '1px solid var(--border)' }}>
          <div role="tablist" style={{ display: 'flex', gap: 4 }}>
            {TABS.map(({ id, label, Icon }) => {
              const active = tab === id
              return (
                <button key={id} role="tab" aria-selected={active} onClick={() => setTab(id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: 'pointer',
                    color: active ? 'var(--text)' : 'var(--text-muted)', fontSize: 12.5, fontWeight: active ? 600 : 400,
                    padding: '9px 12px', borderBottom: active ? '2px solid var(--info)' : '2px solid transparent', marginBottom: -1,
                  }}>
                  <Icon size={15} aria-hidden />{label}
                </button>
              )
            })}
          </div>
          {/* paddingRight varaa tilaa oikean ylakulman kiinteille painikkeille (valikko + teema),
              jotta breadcrumb jaa niiden vasemmalle puolelle eika mene paallekkain */}
          <div style={{ marginLeft: 'auto', alignSelf: 'center', paddingRight: 90, minWidth: 0, whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis' }}>{breadcrumb}</div>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {tab === 'analyysi' && <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, minHeight: '100%', boxSizing: 'border-box' }}>{children}</div>}
        {tab === 'ai' && <div style={{ height: '100%' }}><AiChat context={aiContext} attachments={reportAttachments} /></div>}
        {tab === 'raportti' && <ReportTab context={reportContext} attachments={reportAttachments} />}
      </div>
    </main>
  )
}
