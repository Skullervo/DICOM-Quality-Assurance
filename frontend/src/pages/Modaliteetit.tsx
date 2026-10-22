import { Link } from 'react-router-dom'

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
