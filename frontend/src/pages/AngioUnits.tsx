// =============================================================================
// pages/AngioUnits.tsx — Angiografialaitteiden lista (/angio/units)
// =============================================================================
// Kuten XrayUnits. Valinnainen ?institution=... rajaa laitokseen. Laite
// tunnistetaan laitos + asemanimi -parina (sama kuin röntgenillä).
// =============================================================================

import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { api, type DeviceUnit } from '../api/client'
import { BreadcrumbNav } from '../components/Breadcrumb'

export default function AngioUnits() {
  // Laitossuodatin osoiterivin query-parametrista.
  const [searchParams] = useSearchParams()
  const institution = searchParams.get('institution') ?? undefined

  // Hae angiografialaitteet (laitoskohtaisesti välimuistitettuna).
  const { data: units, isLoading, error } = useQuery<DeviceUnit[]>({
    queryKey: ['angio', 'units', institution],
    queryFn: () => api.angioUnits(institution),
  })

  // Lataus- ja virhetilojen näyttö.
  if (isLoading) return <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>Loading...</p>

  if (error) {
    return (
      <div className="status-message status-error">
        <h4>Error loading data</h4>
        <p>{(error as Error).message}</p>
        <Link to="/angio/institutions" className="btn-outline">Back to institutions</Link>
      </div>
    )
  }

  return (
    <>
      <BreadcrumbNav items={[
        { label: 'Home', path: '/' },
        { label: 'Modalities', path: '/modaliteetit' },
        { label: 'Angiography Institutions', path: '/angio/institutions' },
        { label: institution ? `${institution} Departments` : 'Angiography devices' },
      ]} />

      <div className="page-header">
        <h1>{institution ? `${institution} Angiography devices` : 'All angiography devices'}</h1>
        <p>Leeds TOR-18 phantom measurements by department.</p>
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
                    {/* Laitelinkki: polussa sekä laitos että asemanimi (angion tunniste). */}
                    <Link to={`/angio/device/${encodeURIComponent(unit.institution_name)}/${encodeURIComponent(unit.station_name)}`}>
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
