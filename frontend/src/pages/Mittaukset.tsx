// =============================================================================
// pages/Mittaukset.tsx — Mittaukset-aloitussivu (/mittaukset)
// =============================================================================
// Korttiruudukko (kuten Modaliteetit/Laitteet); kortit vievät kunkin modaliteetin
// MITTAUSTAULUKKOON. Mittaukset-näkymä näyttää kaikki mittaukset (data luetaan myös
// Orthancista), joten mukana ovat myös ne, joiden analyysi epäonnistui.
// =============================================================================

// Mittaukset-aloitussivu: korttinäkymä (kuten Modaliteetit/Laitteet); kortit
// ohjaavat kunkin modaliteetin mittaustaulukkoon (kaikki mittaukset, myös
// epäonnistuneet analyysit).
import { Link } from 'react-router-dom'

const modalities = [
  { label: 'Ultrasound', image: '/images/ultrasound_image.bmp', path: '/mittaukset/us' },
  { label: 'Radiography', image: '/images/XRAY.png', path: '/mittaukset/xray' },
  { label: 'Computed tomography', image: '/images/CT.png', path: '/mittaukset/ct' },
  { label: 'Angiography', image: '/images/ANGIO.png', path: '/mittaukset/angio' },
]

export default function Mittaukset() {
  return (
    <>
      <div className="page-header">
        <h1>Measurements</h1>
        <p>Select a modality to see all measurements including those whose analysis failed</p>
      </div>

      <div className="card-grid">
        {modalities.map((m) => (
          <div key={m.path} className="card">
            <img src={m.image} alt={m.label} />
            <div className="card-body">
              <p className="card-text">{m.label}</p>
              <Link to={m.path} className="btn">Show measurements</Link>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
