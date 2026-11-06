// =============================================================================
// components/qa/contextText.ts — Laitteen tilakonteksti tekstimuotoon
// =============================================================================
// Muuntaa rakenteisen ReportContext-olion (taulukot + rajan ulkopuolella olevat
// mittarit) yhdeksi selkeäksi tekstilohkoksi. Tätä käytetään sekä Slack-
// raporttiviestin runkona että taustatietona AI-avustajalle lähetettävässä
// kysymyksessä.
// =============================================================================

// Kontekstin litistys tekstiksi (raporttiviesti / AI-kysymyksen tausta).
import type { ReportContext } from './ReportTab'

export function contextToText(context: ReportContext): string {
  // Rajan ulkopuolella olevat mittarit (voi puuttua -> tyhjä lista).
  const failing = context.failing ?? []
  // Ensin jokainen osio otsikkoineen ja "label: value" -riveineen,
  // osiot eroteltuna tyhjällä rivillä.
  return context.sections.map((sec) => `${sec.title}:\n${sec.rows.map((r) => `  ${r.label}: ${r.value}`).join('\n')}`).join('\n\n')
    // Lopuksi, jos rajan ulkopuolisia on, listataan ne FAIL/WARNING-merkinnöin ja raja mukaan.
    + (failing.length ? `\n\nOut of limits:\n${failing.map((x) => `  - ${x.label} ${x.value} [${x.status === 'fail' ? 'FAIL' : 'WARNING'}${x.limit !== '' ? ', limit ' + x.limit : ''}]`).join('\n')}` : '')
}
