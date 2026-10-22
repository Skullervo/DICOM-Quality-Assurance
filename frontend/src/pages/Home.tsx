// =============================================================================
// Home.tsx — Etusivu ("/") kirjautumisen jälkeen
// =============================================================================
// Yksinkertainen aloitusnäkymä, joka toivottaa käyttäjän tervetulleeksi ja
// tarjoaa yhden painikkeen, josta pääsee modaliteettien valintaan
// ("/modaliteetit"). Ei hae mitään dataa backendiltä — pelkkää staattista tekstiä.
// =============================================================================

import { Link } from 'react-router-dom'

// Home renderöi aloitussivun sisällön (otsikko, esittelyteksti ja linkkipainike).
export default function Home() {
  return (
    // marginTop varaa tilaa kiinteälle navigaatiopalkille (--navbar-height CSS-muuttuja).
    <div className="cover-page" style={{ marginTop: 'var(--navbar-height)' }}>
      <div className="cover-container">
        <h1>Quality assurance of medical imaging devices</h1>
        <p className="lead">
          Welcome to the POHDE quality assurance site. Click to proceed to the medical
          imaging quality assurance modalities.
        </p>
        <p>
          {/* Link vie modaliteettien valintasivulle ilman koko sivun uudelleenlatausta. */}
          <Link to="/modaliteetit" className="btn">Modalities</Link>
        </p>
      </div>
    </div>
  )
}
