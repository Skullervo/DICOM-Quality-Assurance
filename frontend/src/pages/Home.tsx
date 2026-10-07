import { Link } from 'react-router-dom'

export default function Home() {
  return (
    <div className="cover-page" style={{ marginTop: 'var(--navbar-height)' }}>
      <div className="cover-container">
        <h1>Quality assurance of medical imaging devices</h1>
        <p className="lead">
          Welcome to the POHDE quality assurance site. Click to proceed to the medical
          imaging quality assurance modalities.
        </p>
        <p>
          <Link to="/modaliteetit" className="btn">Modalities</Link>
        </p>
      </div>
    </div>
  )
}
