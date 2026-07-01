import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { api, type USUnit } from '../api/client'
import { BreadcrumbNav } from '../components/Breadcrumb'

export default function USUnits() {
  const [searchParams] = useSearchParams()
  const institution = searchParams.get('institution') ?? undefined

  const { data: units, isLoading, error } = useQuery<USUnit[]>({
    queryKey: ['us', 'units', institution],
    queryFn: () => api.usUnits(institution),
  })

  if (isLoading) return <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>Ladataan...</p>

  if (error) {
    return (
      <div className="status-message status-error">
        <h4>Virhe ladattaessa dataa</h4>
        <p>{(error as Error).message}</p>
        <Link to="/us/institutions" className="btn-outline">Takaisin instituutioihin</Link>
      </div>
    )
  }

  return (
    <>
      <BreadcrumbNav items={[
        { label: 'Aloitus', path: '/' },
        { label: 'Modaliteetit', path: '/modaliteetit' },
        { label: 'Instituutiot', path: '/us/institutions' },
        { label: institution ? `${institution} — Osastot` : 'Osastot' },
      ]} />

      <div className="page-header">
        <h1>{institution ? `${institution} — Laitteet` : 'Kaikki ultraäänilaitteet'}</h1>
        <p>Tutustu laadunvalvontatuloksiin klikkaamalla laitteen nimeä.</p>
      </div>

      <div className="table-container">
        <table className="modern-table">
          <thead>
            <tr>
              <th>Laite</th>
              <th>Instituutio</th>
              <th className="hide-mobile">Valmistaja</th>
              <th className="hide-mobile">Malli</th>
              <th className="hide-mobile">Viim. mittaus</th>
              <th>Mittauksia</th>
            </tr>
          </thead>
          <tbody>
            {units && units.length > 0 ? (
              units.map((unit) => (
                <tr key={unit.station_name}>
                  <td>
                    <Link to={`/us/device/${encodeURIComponent(unit.station_name)}`}>
                      {unit.station_name}
                    </Link>
                  </td>
                  <td>{unit.institution_name}</td>
                  <td className="hide-mobile">{unit.manufacturer}</td>
                  <td className="hide-mobile">{unit.manufacturer_model}</td>
                  <td className="hide-mobile">
                    {unit.last_measurement ? unit.last_measurement.slice(0, 10) : '—'}
                  </td>
                  <td>{unit.measurement_count}</td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={6}>Ei laitteita saatavilla.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
