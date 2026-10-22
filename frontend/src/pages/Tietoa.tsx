// =============================================================================
// pages/Tietoa.tsx — "Tietoa järjestelmästä" -sivu (/tietoa)
// =============================================================================
// Staattinen esittelysivu: kertoo mitä järjestelmä tekee ja mitä modaliteetteja
// se kattaa. Ei datahakuja.
// =============================================================================

export default function Tietoa() {
  return (
    <div className="cover-page" style={{ marginTop: 'var(--navbar-height)' }}>
      <div className="cover-container">
        <div style={{ maxWidth: 800, textAlign: 'center', padding: '2rem' }}>
          <h1>About the system</h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            On this site you can review the quality assurance results of the medical
            imaging devices located in the POHDE region.
          </p>
          <p style={{ color: 'var(--text-secondary)' }}>
            The system covers the following imaging modalities:
          </p>
          <ul className="modalities-list">
            <li>Ultrasound (US)</li>
            <li>Computed tomography (CT)</li>
            <li>Radiography</li>
          </ul>
          <p style={{ color: 'var(--text-secondary)' }}>
            The site aims to provide a clear and up-to-date view of the quality assurance
            status of the devices, supporting the work of both physicists and clinical users.
          </p>
        </div>
      </div>
    </div>
  )
}
