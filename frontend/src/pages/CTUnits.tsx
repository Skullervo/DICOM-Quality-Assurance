// =============================================================================
// pages/CTUnits.tsx — TT-laitteiden lista (/ct/units)
// =============================================================================
// Kuten USUnits. Valinnainen ?institution=... rajaa laitokseen. Laitelinkki vie
// laitteen QA-sivulle (CT tunnistetaan asemanimellä).
// =============================================================================

import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { api, type DeviceUnit } from '../api/client'
import { BreadcrumbNav } from '../components/Breadcrumb'

export default function CTUnits() {
  // Laitossuodatin osoiterivin query-parametrista.
  const [searchParams] = useSearchParams()
  const institution = searchParams.get('institution') ?? undefined

  // Hae TT-laitteet (laitoskohtaisesti välimuistitettuna).
  const { data: units, isLoading, error } = useQuery<DeviceUnit[]>({
    queryKey: ['ct', 'units', institution],
    queryFn: () => api.ctUnits(institution),
  })

  // Lataus- ja virhetilojen näyttö.
  if (isLoading) return <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>Loading...</p>

  if (error) {
    return (
      <div className="status-message status-error">
        <h4>Error loading data</h4>
        <p>{(error as Error).message}</p>
        <Link to="/ct/institutions" className="btn-outline">Back to institutions</Link>
      </div>
    )
  }

  return (
    <>
      <BreadcrumbNav items={[
        { label: 'Home', path: '/' },
        { label: 'Modalities', path: '/modaliteetit' },
        { label: 'CT Institutions', path: '/ct/institutions' },
        { label: institution ? `${institution} Departments` : 'CT devices' },
      ]} />

      <div className="page-header">
        <h1>{institution ? `${institution} CT departments` : 'All CT devices'}</h1>
        <p>CT measurements with CatPhan / Siemens phantoms, by department.</p>
      </div>

      <div className="table-container">
        <table className="modern-table">
          <thead>
            <tr>
              <th>Device</th>
              <th>Institution</th>
              <th className="hide-mobile">Manufacturer</th>
              <th className="hide-mobile">Model</th>
              <th className="hide-mobile">Last measurement</th>
              <th>Measurements</th>
            </tr>
          </thead>
          <tbody>
            {units && units.length > 0 ? (
              units.map((unit) => (
                <tr key={unit.station_name}>
                  <td>
                    {/* Laitelinkki laitteen QA-sivulle (asemanimi URL-polussa). */}
                    <Link to={`/ct/device/${encodeURIComponent(unit.station_name)}`}>
                      {unit.station_name}
                    </Link>
                  </td>
                  <td>{unit.institution_name}</td>
                  <td className="hide-mobile">{unit.manufacturer}</td>
                  <td className="hide-mobile">{unit.manufacturer_model}</td>
                  <td className="hide-mobile">
                    {unit.last_measurement ? unit.last_measurement.slice(0, 10) : ''}
                  </td>
                  <td>{unit.measurement_count}</td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={6}>No devices available.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
