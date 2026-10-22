// =============================================================================
// pages/USUnits.tsx — Ultraäänilaitteiden lista (/us/units)
// =============================================================================
// Näyttää US-laitteet taulukkona. Jos URL:ssä on ?institution=..., lista
// rajataan kyseiseen laitokseen; muuten näytetään kaikki laitteet. Laitetta
// klikkaamalla avautuu laitteen QA-trendisivu (USDeviceDetails).
// =============================================================================

import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { api, type USUnit } from '../api/client'
import { BreadcrumbNav } from '../components/Breadcrumb'

export default function USUnits() {
  // Lue laitossuodatin osoiterivin query-parametrista (?institution=...).
  const [searchParams] = useSearchParams()
  const institution = searchParams.get('institution') ?? undefined

  // Hae laitteet; institution mukana avaimessa -> eri laitokset välimuistitetaan erikseen.
  const { data: units, isLoading, error } = useQuery<USUnit[]>({
    queryKey: ['us', 'units', institution],
    queryFn: () => api.usUnits(institution),
  })

  // Lataus- ja virhetilojen näyttö.
  if (isLoading) return <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>Loading...</p>

  if (error) {
    return (
      <div className="status-message status-error">
        <h4>Error loading data</h4>
        <p>{(error as Error).message}</p>
        <Link to="/us/institutions" className="btn-outline">Back to institutions</Link>
      </div>
    )
  }

  return (
    <>
      <BreadcrumbNav items={[
        { label: 'Home', path: '/' },
        { label: 'Modalities', path: '/modaliteetit' },
        { label: 'Institutions', path: '/us/institutions' },
        { label: institution ? `${institution} — Departments` : 'Departments' },
      ]} />

      <div className="page-header">
        <h1>{institution ? `${institution} — Devices` : 'All ultrasound devices'}</h1>
        <p>Click a device name to view its quality assurance results.</p>
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
            {/* Rivit laitteista; tyhjä-viesti jos ei yhtään. */}
            {units && units.length > 0 ? (
              units.map((unit) => (
                <tr key={unit.station_name}>
                  <td>
                    {/* Laitelinkki vie laitteen QA-trendisivulle (asemanimi URL-polussa). */}
                    <Link to={`/us/device/${encodeURIComponent(unit.station_name)}`}>
                      {unit.station_name}
                    </Link>
                  </td>
                  <td>{unit.institution_name}</td>
                  <td className="hide-mobile">{unit.manufacturer}</td>
                  <td className="hide-mobile">{unit.manufacturer_model}</td>
                  <td className="hide-mobile">
                    {/* Näytä vain päivämääräosa (10 ensimmäistä merkkiä) tai viiva jos puuttuu. */}
                    {unit.last_measurement ? unit.last_measurement.slice(0, 10) : '—'}
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
