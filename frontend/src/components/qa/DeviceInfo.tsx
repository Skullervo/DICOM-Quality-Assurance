// =============================================================================
// components/qa/DeviceInfo.tsx — "DICOM info" -kortti laitesivun sivupaneelissa
// =============================================================================
// Näyttää laitteen perustiedot (DICOM-metatiedot) yhtenä korttina, kentät
// allekkain ohuin erottimin. chips = tärkeimmät kentät, more = valinnaiset
// lisäkentät saman kortin jatkoksi.
// =============================================================================

// Laitetiedot (brief osio 6.6): kaikki kentät YHDEN kortin sisällä allekkain,
// ohuilla erottimilla (ei enää per-rivi-laatikoita). "chips" = tärkeimmät
// (DICOM-perustiedot), "more" = lisätiedot samalla tyylillä suoraan niiden alla.
// Yksi näytettävä kenttä: otsikko (label) + arvo (value).
export type InfoField = { label: string; value: string }

// Yksi kentän rivi. last=true jättää alaviivan pois (viimeinen rivi).
function InfoRow({ field, last }: { field: InfoField; last: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '7px 10px', minWidth: 0,
      borderBottom: last ? 'none' : '1px solid var(--border)' }}>
      <span style={{ fontSize: 9, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.04em', flexShrink: 0 }}>
        {field.label}:
      </span>
      {/* Arvo; title näyttää koko tekstin hoverilla jos se katkaistaan (ellipsis). */}
      <span className="num" title={field.value || undefined}
        style={{ fontSize: 12.5, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
        {field.value || '—'}
      </span>
    </div>
  )
}

// Kortti, joka yhdistää chips- ja more-kentät yhdeksi riippuvaksi listaksi.
export function DeviceInfo({ chips, more = [] }: { chips: InfoField[]; more?: InfoField[] }) {
  const rows = [...chips, ...more]  // yhdistetään yhteen listaan näyttöä varten
  return (
    <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 9, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.06em', paddingLeft: 2 }}>
        DICOM info
      </div>
      <div style={{ background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
        {/* Renderöi jokainen kenttä rivinä; viimeiselle ei alaviivaa. */}
        {rows.map((c, i) => <InfoRow key={c.label} field={c} last={i === rows.length - 1} />)}
      </div>
    </div>
  )
}
