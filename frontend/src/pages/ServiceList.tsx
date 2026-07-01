import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { BreadcrumbNav } from '../components/Breadcrumb'

interface Service {
  id: number;
  name: string;
  status?: string;
  image?: string;
}

export default function ServiceList() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['hallinta', 'services'],
    queryFn: async (): Promise<Service[]> => {
      const raw = await api.hallintaServices()
      return raw as unknown as Service[]
    },
  })

  if (isLoading) return <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>Ladataan...</p>

  return (
    <>
      <BreadcrumbNav items={[
        { label: 'Aloitus', path: '/' },
        { label: 'Hallinta', path: '/hallinta' },
        { label: 'Palvelut' },
      ]} />

      <div className="page-header">
        <h1>Palvelut</h1>
        <p>Hallinnoi käynnissä olevia palveluita.</p>
      </div>

      {error ? (
        <div className="status-message" style={{ borderColor: 'var(--status-warn)' }}>
          <h4 style={{ color: 'var(--status-warn)' }}>⚠️ Backend ei käytettävissä</h4>
          <p>Hallinta-backend siirretään parhaillaan PostgreSQL:ään.</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="modern-table">
            <thead>
              <tr>
                <th>Nimi</th>
                <th>Tila</th>
                <th className="hide-mobile">Image</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((svc) => (
                <tr key={svc.id}>
                  <td>{svc.name}</td>
                  <td>
                    <span style={{
                      fontSize: '0.75rem', padding: '2px 8px', borderRadius: 4,
                      background: svc.status === 'running' ? 'rgba(63,185,80,0.15)' : 'var(--bg-secondary)',
                      color: svc.status === 'running' ? 'var(--status-ok)' : 'var(--text-secondary)',
                    }}>
                      {svc.status ?? '—'}
                    </span>
                  </td>
                  <td className="hide-mobile" style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{svc.image ?? '—'}</td>
                  <td>
                    <Link to={`/hallinta/services/${svc.id}`}>Avaa →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
