// =============================================================================
// pages/ServiceList.tsx — Hallinnan palvelulista (/hallinta/services)
// =============================================================================
// Listaa alustan palvelut taulukkona (nimi, tila, image). Backend on vielä
// migraatiossa, joten haku palauttaa usein virheen -> näytetään tällöin
// "backend ei käytettävissä" -ilmoitus datan sijaan.
// =============================================================================

import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { BreadcrumbNav } from '../components/Breadcrumb'

// Yhden palvelun muoto (backendin kenttien osajoukko).
interface Service {
  id: number;
  name: string;
  status?: string;
  image?: string;
}

export default function ServiceList() {
  // Hae palvelut; raakavastaus tulkitaan Service-taulukoksi.
  const { data, isLoading, error } = useQuery({
    queryKey: ['hallinta', 'services'],
    queryFn: async (): Promise<Service[]> => {
      const raw = await api.hallintaServices()
      return raw as unknown as Service[]
    },
  })

  if (isLoading) return <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>Loading...</p>

  return (
    <>
      <BreadcrumbNav items={[
        { label: 'Home', path: '/' },
        { label: 'Platform', path: '/hallinta' },
        { label: 'Services' },
      ]} />

      <div className="page-header">
        <h1>Services</h1>
        <p>Manage running services.</p>
      </div>

      {/* Virhe (tavallisesti 501 migraation aikana) -> ilmoitus; muuten palvelutaulukko. */}
      {error ? (
        <div className="status-message" style={{ borderColor: 'var(--status-warn)' }}>
          <h4 style={{ color: 'var(--status-warn)' }}>⚠️ Backend unavailable</h4>
          <p>The platform backend is currently being migrated to PostgreSQL.</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="modern-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th className="hide-mobile">Image</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {/* Rivi per palvelu; 'running'-tila korostetaan vihreällä. */}
              {(data ?? []).map((svc) => (
                <tr key={svc.id}>
                  <td>{svc.name}</td>
                  <td>
                    <span style={{
                      fontSize: '0.75rem', padding: '2px 8px', borderRadius: 4,
                      background: svc.status === 'running' ? 'rgba(63,185,80,0.15)' : 'var(--bg-secondary)',
                      color: svc.status === 'running' ? 'var(--status-ok)' : 'var(--text-secondary)',
                    }}>
                      {svc.status ?? ''}
                    </span>
                  </td>
                  <td className="hide-mobile" style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{svc.image ?? ''}</td>
                  <td>
                    <Link to={`/hallinta/services/${svc.id}`}>Open →</Link>
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
