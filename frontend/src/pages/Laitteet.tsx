// Laitteet-aloitussivu: sama korttinäkymä kuin Modaliteetit, mutta kortit
// ohjaavat kunkin modaliteetin laitetaulukkoon (laitteet joilla on analyysejä).
import { Link } from 'react-router-dom'

const modalities = [
  { label: 'Ultraääni', image: '/images/ultrasound_image.bmp', path: '/laitteet/us' },
  { label: 'Natiiviröntgen', image: '/images/XRAY.png', path: '/laitteet/xray' },
  { label: 'Tietokonetomografia', image: '/images/CT.png', path: '/laitteet/ct' },
]

export default function Laitteet() {
  return (
    <>
      <div className="page-header">
        <h1>Laitteet</h1>
        <p>Valitse modaliteetti nähdäksesi laitteet joilla on tehty analyysejä</p>
      </div>

      <div className="card-grid">
        {modalities.map((m) => (
          <div key={m.path} className="card">
            <img src={m.image} alt={m.label} />
            <div className="card-body">
              <p className="card-text">{m.label}</p>
              <Link to={m.path} className="btn">Näytä laitteet</Link>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
