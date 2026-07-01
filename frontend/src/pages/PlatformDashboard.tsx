import { Link } from 'react-router-dom'
import { BreadcrumbNav } from '../components/Breadcrumb'

const sections = [
  {
    title: 'Palvelut',
    description: 'Hallinnoi käynnissä olevia palveluita ja niiden tilaa.',
    href: '/hallinta/services',
    icon: '⚙️',
  },
  {
    title: 'Pinostot',
    description: 'Hallinnoi palvelupinoja ja niiden yhteyksiä.',
    href: '/hallinta/stacks',
    icon: '📦',
  },
  {
    title: 'Projektit',
    description: 'Hallinnoi projekteja ja niiden kerroksia.',
    href: '/hallinta/projects',
    icon: '📁',
  },
]

export default function PlatformDashboard() {
  return (
    <>
      <BreadcrumbNav items={[
        { label: 'Aloitus', path: '/' },
        { label: 'Hallinta' },
      ]} />

      <div className="page-header">
        <h1>Hallintaportaali</h1>
        <p>AutoQAD-palveluiden hallinta ja valvonta.</p>
      </div>

      <div className="card-grid">
        {sections.map((s) => (
          <Link key={s.href} to={s.href} className="card" style={{ textDecoration: 'none' }}>
            <div className="card-body">
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>{s.icon}</div>
              <p className="card-text">{s.title}</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{s.description}</p>
            </div>
          </Link>
        ))}
      </div>

      <div style={{
        maxWidth: 1200, margin: '2rem auto', padding: '1rem 1.5rem',
        background: 'var(--bg-card)', border: '1px solid var(--status-warn)',
        borderRadius: 'var(--border-radius)', fontSize: '0.85rem',
        color: 'var(--status-warn)',
      }}>
        ⚠️ Hallinta-backend siirretään parhaillaan SQLitestä PostgreSQL:ään.
        Osa toiminnoista ei ole vielä käytettävissä.
      </div>
    </>
  )
}
