// Jaettu rakenteinen konteksti: tiiviit taulukot (DICOM-tiedot, Analyysitulokset)
// + "Rajan ulkopuolella" -rivit. Käytössä sekä Raportoi ongelmasta- että
// Kysy tekoälyltä -välilehdellä.
import type { CSSProperties } from 'react'
import type { ReportContext } from './ReportTab'

const labelStyle: CSSProperties = { fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 6 }
const failPill = (status: 'warn' | 'fail'): CSSProperties => ({
  fontSize: 9.5, fontWeight: 700, letterSpacing: '.03em', textTransform: 'uppercase',
  padding: '2px 7px', borderRadius: 10, whiteSpace: 'nowrap', flexShrink: 0,
  color: `var(--${status})`, background: `var(--${status}-bg)`,
  border: `1px solid color-mix(in srgb, var(--${status}) 40%, transparent)`,
})

export function ContextView({ context }: { context: ReportContext }) {
  const failing = context.failing ?? []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {context.sections.map((sec) => (
        <div key={sec.title}>
          <div style={labelStyle}>{sec.title}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 20 }}>
            {sec.rows.map((r) => (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', padding: '4px 0', borderBottom: '1px solid var(--border)', minWidth: 0 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{r.label}</span>
                <span className="num" title={r.value} style={{ fontSize: 12.5, color: 'var(--text)', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      {failing.length > 0 && (
        <div>
          <div style={{ ...labelStyle, color: 'var(--warn)' }}>Out of limits</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {failing.map((f) => (
              <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={failPill(f.status)}>{f.status === 'fail' ? 'Fail' : 'Warning'}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.label}</span>
                <span className="num" style={{ fontSize: 12.5, color: 'var(--text)', whiteSpace: 'nowrap' }}>{f.value}</span>
                <span style={{ fontSize: 11, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>limit {f.limit}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
