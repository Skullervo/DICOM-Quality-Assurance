import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { BreadcrumbNav } from '../components/Breadcrumb'

interface Project {
  id: number;
  name: string;
  description?: string;
  layer_count?: number;
}

export default function Projects() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['hallinta', 'projects'],
    queryFn: async (): Promise<Project[]> => {
      const raw = await api.hallintaProjects()
      return raw as unknown as Project[]
    },
  })

  if (isLoading) return <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>Ladataan...</p>

  return (
    <>
      <BreadcrumbNav items={[
        { label: 'Aloitus', path: '/' },
        { label: 'Hallinta', path: '/hallinta' },
        { label: 'Projektit' },
      ]} />

      <div className="page-header">
        <h1>Projektit</h1>
        <p>Hallinnoi projekteja ja niiden kerroksia.</p>
      </div>

      {error ? (
        <div className="status-message" style={{ borderColor: 'var(--status-warn)' }}>
          <h4 style={{ color: 'var(--status-warn)' }}>⚠️ Backend ei käytettävissä</h4>
          <p>Hallinta-backend siirretään parhaillaan PostgreSQL:ään.</p>
        </div>
      ) : (
        <div className="card-grid">
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
