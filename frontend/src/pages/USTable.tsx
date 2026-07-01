import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { BreadcrumbNav } from '../components/Breadcrumb'

export default function USTable() {
  const { data: units, isLoading } = useQuery({
    queryKey: ['us', 'units'],
    queryFn: () => api.usUnits(),
  })

  if (isLoading) return <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>Ladataan...</p>

  return (
    <>
      <BreadcrumbNav items={[
        { label: 'Aloitus', path: '/' },
        { label: 'Modaliteetit', path: '/modaliteetit' },
        { label: 'Ultraääni', path: '/us' },
        { label: 'Taulukko' },
      ]} />

      <div className="page-header">
        <h1>Ultraäänidata</h1>
        <p>Kaikkien laitteiden mittausdata.</p>
      </div>

      <div className="table-container">
        <table className="modern-table">
          <thead>
            <tr>
              <th>Laite</th>
              <th>Instituutio</th>
              <th className="hide-mobile">Valmistaja</th>
              <th className="hide-mobile">Malli</th>
              <th>Mittauksia</th>
              <th className="hide-mobile">Viim. mittaus</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(units ?? []).map((unit) => (
              <tr key={unit.station_name}>
                <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{unit.station_name}</td>
                <td>{unit.institution_name}</td>
                <td className="hide-mobile">{unit.manufacturer}</td>
                <td className="hide-mobile">{unit.manufacturer_model}</td>
                <td>{unit.measurement_count}</td>
                <td className="hide-mobile">
                  {unit.last_measurement ? unit.last_measurement.slice(0, 10) : '—'}
                </td>
                <td>
                  <Link to={`/us/device/${encodeURIComponent(unit.station_name)}`}>
                    Avaa →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
