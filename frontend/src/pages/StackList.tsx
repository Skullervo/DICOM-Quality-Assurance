import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { BreadcrumbNav } from '../components/Breadcrumb'

interface Stack {
  id: number;
  name: string;
  description?: string;
  service_count?: number;
}

export default function StackList() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['hallinta', 'stacks'],
    queryFn: async (): Promise<Stack[]> => {
      const raw = await api.hallintaStacks()
      return raw as unknown as Stack[]
    },
  })

  if (isLoading) return <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>Ladataan...</p>

  return (
    <>
      <BreadcrumbNav items={[
        { label: 'Aloitus', path: '/' },
        { label: 'Hallinta', path: '/hallinta' },
        { label: 'Pinostot' },
      ]} />

      <div className="page-header">
        <h1>Pinostot</h1>
        <p>Hallinnoi palvelupinoja ja niiden yhteyksiä.</p>
      </div>

      {error ? (
        <div className="status-message" style={{ borderColor: 'var(--status-warn)' }}>
          <h4 style={{ color: 'var(--status-warn)' }}>⚠️ Backend ei käytettävissä</h4>
          <p>Hallinta-backend siirretään parhaillaan PostgreSQL:ään.</p>
        </div>
      ) : (
        <div className="card-grid">
          {(data ?? []).map((stack) => (
            <div key={stack.id} className="card">
              <div className="card-body">
                <p className="card-text">{stack.name}</p>
                {stack.description && <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>{stack.description}</p>}
                {stack.service_count !== undefined && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{stack.service_count} palvelua</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
