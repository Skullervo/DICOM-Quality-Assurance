// =============================================================================
// pages/Modaliteetit.tsx — Modaliteettien valintasivu (/modaliteetit)
// =============================================================================
// Näyttää korttiruudukon neljästä modaliteetista (US, röntgen, TT, angio).
// Jokainen kortti vie kyseisen modaliteetin laitoslistaan. Puhtaasti staattinen
// sivu — ei datahakuja.
// =============================================================================

import { Link } from 'react-router-dom'

// Korteissa näytettävät modaliteetit: nimi, kuva ja kohdepolku (laitoslista).
const modalities = [
  {
    label: 'Ultrasound',
    image: '/images/ultrasound_image.bmp',
    path: '/us/institutions',
  },
  {
    label: 'Radiography',
    image: '/images/XRAY.png',
    path: '/xray/institutions',
  },
  {
    label: 'Computed tomography',
    image: '/images/CT.png',
    path: '/ct/institutions',
  },
  {
    label: 'Angiography',
    image: '/images/ANGIO.png',
    path: '/angio/institutions',
  },
]

export default function Modaliteetit() {
  return (
    <>
      <div className="page-header">
        <h1>Modalities</h1>
        <p>Select an imaging modality</p>
      </div>

      {/* Yksi kortti per modaliteetti. */}
      <div className="card-grid">
        {modalities.map((m) => (
          <div key={m.path} className="card">
            <img src={m.image} alt={m.label} />
            <div className="card-body">
              <p className="card-text">{m.label}</p>
              <Link to={m.path} className="btn">Institutions</Link>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
