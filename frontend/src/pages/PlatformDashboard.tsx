import { Link } from 'react-router-dom'
import { BreadcrumbNav } from '../components/Breadcrumb'

const sections = [
  {
    title: 'Services',
    description: 'Manage running services and their status.',
    href: '/hallinta/services',
    icon: '⚙️',
  },
  {
    title: 'Stacks',
    description: 'Manage service stacks and their connections.',
    href: '/hallinta/stacks',
    icon: '📦',
  },
  {
    title: 'Projects',
    description: 'Manage projects and their layers.',
    href: '/hallinta/projects',
    icon: '📁',
  },
]

export default function PlatformDashboard() {
  return (
    <>
      <BreadcrumbNav items={[
        { label: 'Home', path: '/' },
        { label: 'Platform' },
      ]} />

      <div className="page-header">
        <h1>Platform portal</h1>
        <p>Management and monitoring of AutoQAD services.</p>
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
        ⚠️ The platform backend is currently being migrated from SQLite to PostgreSQL.
        Some features are not yet available.
      </div>
    </>
  )
}
