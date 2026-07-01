import { Link } from 'react-router-dom'

export default function Home() {
  return (
    <div className="cover-page" style={{ marginTop: 'var(--navbar-height)' }}>
      <div className="cover-container">
        <h1>Lääketieteellisten kuvantamislaitteiden laadunvalvonta</h1>
        <p className="lead">
          Tervetuloa POHTEEN laadunvalvontasivustolle. Klikkaa edetäksesi lääketieteellisen
          kuvantamisen laadunvalvonnan modaliteetteihin.
        </p>
        <p>
          <Link to="/modaliteetit" className="btn">Modaliteetit</Link>
        </p>
      </div>
    </div>
  )
}
