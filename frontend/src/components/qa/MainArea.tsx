// =============================================================================
// components/qa/MainArea.tsx — Laitesivun pääalue: välilehtirunko
// =============================================================================
// Rakentaa laitesivun keskialueen kolmella välilehdellä:
//   - Analysis      : verdiktti, mittarit ja trendikäyrät (children-sisältö).
//   - Ask AI        : kysy tekoälyltä laitteen tilasta (AiChat).
//   - Report issue  : lähetä ongelmailmoitus Slackiin (ReportTab).
// Vasen sivupaneeli (laitetiedot) on tämän komponentin ulkopuolella ja näkyy
// kaikilla välilehdillä. Breadcrumb näytetään välilehtirivin oikeassa laidassa.
// =============================================================================

// Pääalueen välilehti-runko (brief osio 5): Analyysi · Kysy tekoälyltä · Raportoi ongelmasta.
// Pysyvä vasen paneeli on tämän ulkopuolella (näkyy kaikilla välilehdillä).
import { useState, type ReactNode } from 'react'
import { BarChart3, Sparkles, Flag } from 'lucide-react'
import { AiChat } from './AiChat'
import { ReportTab, type ReportAttachment, type ReportContext } from './ReportTab'

// Välilehtien tunnisteet ja niiden määrittely (järjestys = näyttöjärjestys).
export type TabId = 'analyysi' | 'ai' | 'raportti'
const TABS: { id: TabId; label: string; Icon: typeof BarChart3 }[] = [
  { id: 'analyysi', label: 'Analysis', Icon: BarChart3 },
  { id: 'ai', label: 'Ask AI', Icon: Sparkles },
  { id: 'raportti', label: 'Report issue', Icon: Flag },
]

export function MainArea({ breadcrumb, reportContext, reportAttachments, children, onTabChange }: {
  breadcrumb: ReactNode
  reportContext: ReportContext // automaattinen konteksti (raportti + AI, ContextView)
  reportAttachments?: ReportAttachment[] // valittavat kuvaliitteet raporttiin
  children: ReactNode // Analyysi-välilehden sisältö (verdiktti + KPI + trendit)
  onTabChange?: (t: TabId) => void // ilmoita aktiivinen välilehti sivulle (esim. paneelin piilotus)
}) {
  const [tab, setTab] = useState<TabId>('analyysi')  // aktiivinen välilehti, oletus Analyysi
  // Vaihtaa välilehteä ja ilmoittaa muutoksen sivulle (jos onTabChange annettu).
  const selectTab = (id: TabId) => { setTab(id); onTabChange?.(id) }
  return (
    <main style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
      {/* Kiinteä 46px korkeus -> ylin jakoviiva kohdistuu vasemman paneelin otsikkoriviin */}
      <div style={{ height: 46, boxSizing: 'border-box', padding: '0 16px', display: 'flex', alignItems: 'stretch', flexShrink: 0 }}>
        {/* Välilehdet vasemmalle, breadcrumb samalle riville oikeaan laitaan (säästää pystytilaa) */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 16, borderBottom: '1px solid var(--border)' }}>
          <div role="tablist" style={{ display: 'flex', gap: 4 }}>
            {/* Yksi painike per välilehti; aktiivinen korostetaan alaviivalla ja värillä. */}
            {TABS.map(({ id, label, Icon }) => {
              const active = tab === id
              return (
                <button key={id} role="tab" aria-selected={active} onClick={() => selectTab(id)}
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
          {/* paddingRight varaa tilaa oikean ylakulman kiinteille painikkeille
              (valikko + teema + uloskirjautuminen = 3 nappia), jotta breadcrumb jaa
              niiden vasemmalle puolelle eika mene paallekkain (katkeaa ...:lla) */}
          <div style={{ marginLeft: 'auto', alignSelf: 'center', paddingRight: 132, minWidth: 0, whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis' }}>{breadcrumb}</div>
        </div>
      </div>

      {/* Aktiivisen välilehden sisältö (vieritettävä alue). */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {/* Analyysi: sivun oma sisältö (verdiktti + KPI-kortit + trendit). */}
        {tab === 'analyysi' && <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, minHeight: '100%', boxSizing: 'border-box' }}>{children}</div>}
        {/* Kysy tekoälyltä: chat, jolle annetaan laitteen konteksti ja kuvaliitteet. */}
        {tab === 'ai' && <div style={{ height: '100%' }}><AiChat context={reportContext} attachments={reportAttachments} /></div>}
        {/* Raportoi ongelmasta: Slack-ilmoituslomake samalla kontekstilla. */}
        {tab === 'raportti' && <ReportTab context={reportContext} attachments={reportAttachments} />}
      </div>
    </main>
  )
}
