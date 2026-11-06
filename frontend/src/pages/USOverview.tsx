// =============================================================================
// pages/USOverview.tsx — Ultraäänilaitteiden yleiskatsaus (/us)
// =============================================================================
// Hakee kaikki US-laitteet ja ryhmittelee ne laitoksen mukaan. Jokainen laitos
// näkyy omana korttinaan, jossa laitteet ovat klikattavina "napeina". Laitetta
// klikkaamalla avautuu laitteen QA-trendisivu.
// =============================================================================

import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api, type USUnit } from '../api/client'
import { BreadcrumbNav } from '../components/Breadcrumb'

export default function USOverview() {
  // Hae kaikki US-laitteet (ilman laitossuodatinta).
  const { data: units, isLoading, error } = useQuery<USUnit[]>({
    queryKey: ['us', 'units'],
    queryFn: () => api.usUnits(),
  })

  if (isLoading) return <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>Loading...</p>
  if (error) {
    return (
      <div className="status-message status-error">
        <h4>Error loading data</h4>
        <p>{(error as Error).message}</p>
      </div>
    )
  }

  // Ryhmittele laitteet laitoksittain: { laitos -> [laitteet] }.
  const grouped = (units ?? []).reduce<Record<string, USUnit[]>>((acc, unit) => {
    const inst = unit.institution_name || 'Unknown'  // tuntematon laitos saa oletusnimen
    if (!acc[inst]) acc[inst] = []
    acc[inst].push(unit)
    return acc
  }, {})

  return (
    <>
      <BreadcrumbNav items={[
        { label: 'Home', path: '/' },
        { label: 'Modalities', path: '/modaliteetit' },
        { label: 'Ultrasound Devices' },
      ]} />

      <div className="page-header">
        <h1>Ultrasound devices</h1>
        <p>Click a device name to view its quality assurance results.</p>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Yksi kortti per laitos; sisällä laitteet klikattavina linkkeinä. */}
        {Object.entries(grouped).map(([institution, devices]) => (
          <div key={institution} style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--border-radius)',
            padding: '1.25rem',
          }}>
            <h2 style={{
              fontSize: '0.8rem',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '0.75rem',
            }}>
              {institution}
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {devices.map((device) => (
                <Link
                  key={device.station_name}
                  to={`/us/device/${encodeURIComponent(device.station_name)}`}
                  style={{
                    padding: '0.5rem 0.75rem',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    color: 'var(--accent-blue)',
                    textDecoration: 'none',
                    fontSize: '0.85rem',
                    transition: 'border-color 0.2s',
                  }}
                  // Hover korostaa reunan sinisellä (ja palauttaa poistuttaessa).
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-blue)'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                >
                  {device.station_name}
                  {device.manufacturer_model && (
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginLeft: '0.25rem' }}>
                      ({device.manufacturer_model})
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        ))}

        {/* Ei yhtään laitosta/laitetta -> tyhjä-viesti. */}
        {Object.keys(grouped).length === 0 && (
          <p style={{ color: 'var(--text-secondary)' }}>No devices available.</p>
        )}
      </div>
    </>
  )
}
