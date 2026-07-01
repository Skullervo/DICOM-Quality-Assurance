// Tiivistetyt laitetiedot (brief osio 6.6): tärkeimmät chip-rivinä,
// loput "Lisätiedot"-collapsiblen takana.
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

export type InfoField = { label: string; value: string }

export function DeviceInfo({ chips, more = [] }: { chips: InfoField[]; more?: InfoField[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ padding: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {chips.map((c) => (
          <div key={c.label} style={{ background: 'var(--surface-2)', borderRadius: 6, padding: '5px 8px', minWidth: 0 }}>
            <div style={{ fontSize: 9, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{c.label}</div>
            <div className="num" style={{ fontSize: 12.5, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.value || '—'}
            </div>
          </div>
        ))}
      </div>

      {more.length > 0 && (
        <>
          <button onClick={() => setOpen(!open)}
            style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', padding: 0 }}>
            <ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} aria-hidden />
            {open ? 'Piilota lisätiedot' : 'Lisätiedot'}
          </button>
          {open && (
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {more.map((m) => (
                <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
                  <span style={{ color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>{m.label}</span>
                  <span className="num" style={{ color: 'var(--text)', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.value || '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
