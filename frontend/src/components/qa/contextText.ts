// Kontekstin litistys tekstiksi (raporttiviesti / AI-kysymyksen tausta).
import type { ReportContext } from './ReportTab'

export function contextToText(context: ReportContext): string {
  const failing = context.failing ?? []
  return context.sections.map((sec) => `${sec.title}:\n${sec.rows.map((r) => `  ${r.label}: ${r.value}`).join('\n')}`).join('\n\n')
    + (failing.length ? `\n\nOut of limits:\n${failing.map((x) => `  - ${x.label} ${x.value} [${x.status === 'fail' ? 'FAIL' : 'WARNING'}${x.limit !== '—' ? ', limit ' + x.limit : ''}]`).join('\n')}` : '')
}
