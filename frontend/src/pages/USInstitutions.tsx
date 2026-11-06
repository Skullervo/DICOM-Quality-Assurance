// =============================================================================
// pages/USInstitutions.tsx — Ultraäänilaitosten lista (/us/institutions)
// =============================================================================
// Hakee Go-backendiltä (api.usInstitutions) laitokset, joilla on US-mittauksia,
// ja näyttää ne taulukkona. Laitoksen nimeä klikkaamalla poraudutaan kyseisen
// laitoksen US-laitteisiin.
// =============================================================================

import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api, type USInstitution } from '../api/client'
import { BreadcrumbNav } from '../components/Breadcrumb'

export default function USInstitutions() {
  // Hae laitoslista backendiltä. queryKey = välimuistin avain.
  const { data: institutions, isLoading, error } = useQuery<USInstitution[]>({
    queryKey: ['us', 'institutions'],
    queryFn: api.usInstitutions,
  })

  // Latauksen aikana näytetään yksinkertainen latausteksti.
  if (isLoading) return <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>Loading...</p>

  // Virhetilanteessa näytetään virheilmoitus datan sijaan.
  if (error) {
    return (
      <div className="status-message status-error">
        <h4>Error loading data</h4>
        <p>{(error as Error).message}</p>
      </div>
    )
  }

  return (
    <>
      <BreadcrumbNav items={[
        { label: 'Home', path: '/' },
        { label: 'Modalities', path: '/modaliteetit' },
        { label: 'Ultrasound Institutions' },
      ]} />

      <div className="page-header">
        <h1>Institutions</h1>
        <p>Browse quality assurance results across institutions</p>
      </div>

      <div className="table-container">
        <table className="modern-table">
          <thead>
            <tr>
              <th>Institution</th>
              <th>Measurements</th>
              <th>Devices</th>
            </tr>
          </thead>
          <tbody>
            {/* Jos laitoksia on, näytetään rivit; muuten tyhjä-viesti. */}
            {institutions && institutions.length > 0 ? (
              institutions.map((inst) => (
                <tr key={inst.name}>
                  <td>
                    {/* Nimilinkki vie laitoksen US-laitteisiin (nimi query-parametrina). */}
                    <Link to={`/us/units?institution=${encodeURIComponent(inst.name)}`}>
                      {inst.name}
                    </Link>
                  </td>
                  <td>{inst.measurement_count}</td>
                  <td>{inst.device_count}</td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={3}>No institutions available.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
