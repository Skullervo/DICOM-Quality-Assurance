// Laitetiedot (brief osio 6.6): kaikki kentät yhtenäisinä chip-ruutuina.
// "chips" = tärkeimmät (DICOM-perustiedot), "more" = lisätiedot samalla
// tyylillä suoraan niiden alla (ei erillistä collapsiblea).
export type InfoField = { label: string; value: string }

function Chip({ field }: { field: InfoField }) {
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 6, padding: '6px 10px', minWidth: 0,
      display: 'flex', alignItems: 'baseline', gap: 6 }}>
      <span style={{ fontSize: 9, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.04em', flexShrink: 0 }}>
        {field.label}:
      </span>
      <span className="num" title={field.value || undefined}
        style={{ fontSize: 12.5, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
        {field.value || '—'}
      </span>
    </div>
  )
}

export function DeviceInfo({ chips, more = [] }: { chips: InfoField[]; more?: InfoField[] }) {
  return (
    <div style={{ padding: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
        {[...chips, ...more].map((c) => <Chip key={c.label} field={c} />)}
      </div>
    </div>
  )
}
