// =============================================================================
// pages/Projects.tsx — Hallinnan projektilista (/hallinta/projects)
// =============================================================================
// Listaa projektit korttiruudukkona. Kuten muut hallintasivut: backend-virheen
// sattuessa näytetään migraatioilmoitus.
// =============================================================================

import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { BreadcrumbNav } from '../components/Breadcrumb'

// Yhden projektin muoto (backendin kenttien osajoukko).
interface Project {
  id: number;
  name: string;
  description?: string;
  layer_count?: number;
}

export default function Projects() {
  // Hae projektit; raakavastaus tulkitaan Project-taulukoksi.
  const { data, isLoading, error } = useQuery({
    queryKey: ['hallinta', 'projects'],
    queryFn: async (): Promise<Project[]> => {
      const raw = await api.hallintaProjects()
      return raw as unknown as Project[]
    },
  })

  if (isLoading) return <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>Loading...</p>

  return (
    <>
      <BreadcrumbNav items={[
        { label: 'Home', path: '/' },
        { label: 'Platform', path: '/hallinta' },
        { label: 'Projects' },
      ]} />

      <div className="page-header">
        <h1>Projects</h1>
        <p>Manage projects and their layers.</p>
      </div>

      {/* Virhe -> migraatioilmoitus; muuten projektikortit. */}
      {error ? (
        <div className="status-message" style={{ borderColor: 'var(--status-warn)' }}>
          <h4 style={{ color: 'var(--status-warn)' }}>⚠️ Backend unavailable</h4>
          <p>The platform backend is currently being migrated to PostgreSQL.</p>
        </div>
      ) : (
        <div className="card-grid">
          {/* Kortti per projekti. */}
          {(data ?? []).map((project) => (
            <div key={project.id} className="card">
              <div className="card-body">
                <p className="card-text">{project.name}</p>
                {project.description && <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{project.description}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
