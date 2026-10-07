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

  if (isLoading) return <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>Loading...</p>

  return (
    <>
      <BreadcrumbNav items={[
        { label: 'Home', path: '/' },
        { label: 'Platform', path: '/hallinta' },
        { label: 'Stacks' },
      ]} />

      <div className="page-header">
        <h1>Stacks</h1>
        <p>Manage service stacks and their connections.</p>
      </div>

      {error ? (
        <div className="status-message" style={{ borderColor: 'var(--status-warn)' }}>
          <h4 style={{ color: 'var(--status-warn)' }}>⚠️ Backend unavailable</h4>
          <p>The platform backend is currently being migrated to PostgreSQL.</p>
        </div>
      ) : (
        <div className="card-grid">
          {(data ?? []).map((stack) => (
            <div key={stack.id} className="card">
              <div className="card-body">
                <p className="card-text">{stack.name}</p>
                {stack.description && <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>{stack.description}</p>}
                {stack.service_count !== undefined && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{stack.service_count} services</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
