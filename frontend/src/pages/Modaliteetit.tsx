import { Link } from 'react-router-dom'

const modalities = [
  {
    label: 'Ultraääni',
    image: '/images/ultrasound_image.bmp',
    path: '/us/institutions',
  },
  {
    label: 'Natiiviröntgen',
    image: '/images/XRAY.png',
    path: '/xray/institutions',
  },
  {
    label: 'Tietokonetomografia',
    image: '/images/CT.png',
    path: '/ct/institutions',
  },
]

export default function Modaliteetit() {
  return (
    <>
      <div className="page-header">
        <h1>Modaliteetit</h1>
        <p>Valitse kuvantamismodaliteetti</p>
      </div>

      <div className="card-grid">
        {modalities.map((m) => (
          <div key={m.path} className="card">
            <img src={m.image} alt={m.label} />
            <div className="card-body">
              <p className="card-text">{m.label}</p>
              <Link to={m.path} className="btn">Instituutiot</Link>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
