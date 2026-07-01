export default function Tietoa() {
  return (
    <div className="cover-page" style={{ marginTop: 'var(--navbar-height)' }}>
      <div className="cover-container">
        <div style={{ maxWidth: 800, textAlign: 'center', padding: '2rem' }}>
          <h1>Tietoa järjestelmästä</h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Tällä sivustolla voit tarkastella POHTEEN alueella sijaitsevien lääketieteellisten
            kuvantamislaitteiden laadunvalvonnan tuloksia.
          </p>
          <p style={{ color: 'var(--text-secondary)' }}>
            Järjestelmä kattaa seuraavat kuvantamismodaliteetit:
          </p>
          <ul className="modalities-list">
            <li>Ultraääni (UÄ)</li>
            <li>Tietokonetomografia (CT)</li>
            <li>Natiiviröntgen</li>
          </ul>
          <p style={{ color: 'var(--text-secondary)' }}>
            Sivuston tavoitteena on tarjota selkeä ja ajantasainen näkymä laitteiden
            laadunvarmistuksen tilaan, tukien sekä fyysikoiden että kliinisten käyttäjien työtä.
          </p>
        </div>
      </div>
    </div>
  )
}
