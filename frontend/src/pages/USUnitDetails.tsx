// =============================================================================
// pages/USUnitDetails.tsx — Yhden laitoksen US-laitteet (/us/units/:id)
// =============================================================================
// Kuten USUnits, mutta laitos tulee URL-polun :id-parametrista (ei query-
// parametrina). Näyttää kyseisen laitoksen US-laitteet taulukkona.
// =============================================================================

import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, type USUnit } from '../api/client'
import { BreadcrumbNav } from '../components/Breadcrumb'

export default function USUnitDetails() {
  // Laitoksen nimi tulee URL-polusta (/us/units/:id), puretaan URL-koodaus.
  const { id } = useParams<{ id: string }>()
  const institution = id ? decodeURIComponent(id) : ''

  // Hae laitoksen laitteet; enabled estää haun ennen kuin laitos on tiedossa.
  const { data: units, isLoading, error } = useQuery<USUnit[]>({
    queryKey: ['us', 'units', institution],
    queryFn: () => api.usUnits(institution),
    enabled: !!institution,
  })

  // Suojaukset: puuttuva laitos, lataus ja virhe.
  if (!institution) return <p style={{ color: 'var(--status-fail)' }}>Institution not found.</p>
  if (isLoading) return <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>Loading...</p>

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
        { label: 'Institutions', path: '/us/institutions' },
        { label: 'Departments', path: `/us/units?institution=${encodeURIComponent(institution)}` },
        { label: institution },
      ]} />

      <div className="page-header">
        <h1>{institution} Devices</h1>
        <p>
          Click a device name in the table to view the quality assurance results
          for ultrasound devices in the {institution} department.
        </p>
      </div>

      <div className="table-container">
        <table className="modern-table">
          <thead>
            <tr>
              <th>Device</th>
              <th>Manufacturer</th>
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
                    {/* Laitelinkki laitteen QA-trendisivulle. */}
                    <Link to={`/us/device/${encodeURIComponent(unit.station_name)}`}>
                      {unit.station_name}
                    </Link>
                  </td>
                  <td>{unit.manufacturer}</td>
                  <td className="hide-mobile">{unit.manufacturer_model}</td>
                  <td className="hide-mobile">
                    {unit.last_measurement ? unit.last_measurement.slice(0, 10) : ''}
                  </td>
                  <td>{unit.measurement_count}</td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={5}>No devices found for this unit.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
