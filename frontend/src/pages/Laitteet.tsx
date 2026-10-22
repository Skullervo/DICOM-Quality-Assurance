// Laitteet-aloitussivu: sama korttinäkymä kuin Modaliteetit, mutta kortit
// ohjaavat kunkin modaliteetin laitetaulukkoon (laitteet joilla on analyysejä).
import { Link } from 'react-router-dom'

const modalities = [
  { label: 'Ultrasound', image: '/images/ultrasound_image.bmp', path: '/laitteet/us' },
  { label: 'Radiography', image: '/images/XRAY.png', path: '/laitteet/xray' },
  { label: 'Computed tomography', image: '/images/CT.png', path: '/laitteet/ct' },
  { label: 'Angiography', image: '/images/ANGIO.png', path: '/laitteet/angio' },
]

export default function Laitteet() {
  return (
    <>
      <div className="page-header">
        <h1>Devices</h1>
        <p>Select a modality to see the devices that have been analyzed</p>
      </div>

      <div className="card-grid">
        {modalities.map((m) => (
          <div key={m.path} className="card">
            <img src={m.image} alt={m.label} />
            <div className="card-body">
              <p className="card-text">{m.label}</p>
              <Link to={m.path} className="btn">Show devices</Link>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
