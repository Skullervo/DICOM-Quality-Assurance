// Mittaukset-aloitussivu: korttinäkymä (kuten Modaliteetit/Laitteet); kortit
// ohjaavat kunkin modaliteetin mittaustaulukkoon (kaikki mittaukset, myös
// epäonnistuneet analyysit).
import { Link } from 'react-router-dom'

const modalities = [
  { label: 'Ultraääni', image: '/images/ultrasound_image.bmp', path: '/mittaukset/us' },
  { label: 'Natiiviröntgen', image: '/images/XRAY.png', path: '/mittaukset/xray' },
  { label: 'Tietokonetomografia', image: '/images/CT.png', path: '/mittaukset/ct' },
]

export default function Mittaukset() {
  return (
    <>
      <div className="page-header">
        <h1>Mittaukset</h1>
        <p>Valitse modaliteetti nähdäksesi kaikki mittaukset — myös ne joiden analyysi epäonnistui</p>
      </div>

      <div className="card-grid">
        {modalities.map((m) => (
          <div key={m.path} className="card">
            <img src={m.image} alt={m.label} />
            <div className="card-body">
              <p className="card-text">{m.label}</p>
              <Link to={m.path} className="btn">Näytä mittaukset</Link>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
