import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, type USUnit } from '../api/client'
import { BreadcrumbNav } from '../components/Breadcrumb'

export default function USUnitDetails() {
  const { id } = useParams<{ id: string }>()
  const institution = id ? decodeURIComponent(id) : ''

  const { data: units, isLoading, error } = useQuery<USUnit[]>({
    queryKey: ['us', 'units', institution],
    queryFn: () => api.usUnits(institution),
    enabled: !!institution,
  })

  if (!institution) return <p style={{ color: 'var(--status-fail)' }}>Instituutiota ei löydy.</p>
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
        { label: 'Instituutiot', path: '/us/institutions' },
        { label: 'Osastot', path: `/us/units?institution=${encodeURIComponent(institution)}` },
        { label: institution },
      ]} />

      <div className="page-header">
        <h1>{institution} — Laitteet</h1>
        <p>
          Tutustu osaston {institution} ultraäänilaitteen laadunvalvontatuloksiin
          klikkaamalla taulukosta laitteen nimeä.
        </p>
      </div>

      <div className="table-container">
        <table className="modern-table">
          <thead>
            <tr>
              <th>Laite</th>
              <th>Valmistaja</th>
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
                  <td>{unit.manufacturer}</td>
                  <td className="hide-mobile">{unit.manufacturer_model}</td>
                  <td className="hide-mobile">
                    {unit.last_measurement ? unit.last_measurement.slice(0, 10) : '—'}
                  </td>
                  <td>{unit.measurement_count}</td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={5}>Ei laitteita löytynyt tälle yksikölle.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
