// Kontekstin litistys tekstiksi (raporttiviesti / AI-kysymyksen tausta).
import type { ReportContext } from './ReportTab'

export function contextToText(context: ReportContext): string {
  const failing = context.failing ?? []
  return context.sections.map((sec) => `${sec.title}:\n${sec.rows.map((r) => `  ${r.label}: ${r.value}`).join('\n')}`).join('\n\n')
    + (failing.length ? `\n\nRajan ulkopuolella:\n${failing.map((x) => `  - ${x.label} ${x.value} [${x.status === 'fail' ? 'HYLÄTTY' : 'VAROITUS'}${x.limit !== '—' ? ', raja ' + x.limit : ''}]`).join('\n')}` : '')
}
