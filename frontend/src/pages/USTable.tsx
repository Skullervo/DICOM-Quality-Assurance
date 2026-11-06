// =============================================================================
// pages/USTable.tsx — Ultraäänilaitteiden taulukko (/us/taulukko)
// =============================================================================
// Yksinkertainen taulukkonäkymä kaikista US-laitteista (asema, laitos, valmistaja,
// malli, mittausmäärä, viimeisin mittaus) + "Open" -linkki laitteen QA-sivulle.
// =============================================================================

import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { BreadcrumbNav } from '../components/Breadcrumb'

export default function USTable() {
  // Hae kaikki US-laitteet.
  const { data: units, isLoading } = useQuery({
    queryKey: ['us', 'units'],
    queryFn: () => api.usUnits(),
  })

  if (isLoading) return <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>Loading...</p>

  return (
    <>
      <BreadcrumbNav items={[
        { label: 'Home', path: '/' },
        { label: 'Modalities', path: '/modaliteetit' },
        { label: 'Ultrasound', path: '/us' },
        { label: 'Table' },
      ]} />

      <div className="page-header">
        <h1>Ultrasound data</h1>
        <p>Measurement data for all devices.</p>
      </div>

      <div className="table-container">
        <table className="modern-table">
          <thead>
            <tr>
              <th>Device</th>
              <th>Institution</th>
              <th className="hide-mobile">Manufacturer</th>
              <th className="hide-mobile">Model</th>
              <th>Measurements</th>
              <th className="hide-mobile">Last measurement</th>
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
                  {unit.last_measurement ? unit.last_measurement.slice(0, 10) : ''}
                </td>
                <td>
                  {/* Avaa laitteen QA-trendisivun. */}
                  <Link to={`/us/device/${encodeURIComponent(unit.station_name)}`}>
                    Open →
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
