import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api, type XrayInstitution } from '../api/client'
import { BreadcrumbNav } from '../components/Breadcrumb'

export default function XrayInstitutions() {
  const { data: institutions, isLoading, error } = useQuery<XrayInstitution[]>({
    queryKey: ['xray', 'institutions'],
    queryFn: api.xrayInstitutions,
  })

  if (isLoading) return <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>Ladataan...</p>

  if (error) {
    return (
      <div className="status-message status-error">
        <h4>Virhe ladattaessa dataa</h4>
        <p>{(error as Error).message}</p>
      </div>
    )
  }

  return (
    <>
      <BreadcrumbNav items={[
        { label: 'Aloitus', path: '/' },
        { label: 'Modaliteetit', path: '/modaliteetit' },
        { label: 'Natiiviröntgen — Instituutiot' },
      ]} />

      <div className="page-header">
        <h1>Röntgen QA — Instituutiot</h1>
        <p>Valitse instituutio nähdäksesi sen röntgenlaitteet.</p>
      </div>

      <div className="table-container">
        <table className="modern-table">
          <thead>
            <tr>
              <th>Instituutio</th>
              <th>Osastoja</th>
              <th>Laitteita</th>
              <th className="hide-mobile">Instansseja</th>
            </tr>
          </thead>
          <tbody>
            {institutions && institutions.length > 0 ? (
              institutions.map((inst) => (
                <tr key={inst.name}>
                  <td>
                    <Link to={`/xray/units?institution=${encodeURIComponent(inst.name)}`}>
                      {inst.name}
                    </Link>
                  </td>
                  <td>{inst.measurement_count}</td>
                  <td>{inst.device_count}</td>
                  <td className="hide-mobile">{inst.measurement_count}</td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={4}>Ei röntgendataa saatavilla.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
