// Modaliteettikohtainen laitetaulukko: listaa kaikki laitteet joilla on tehty
// analyysejä ko. modaliteetissa, oleelliset DICOM-tiedot taulukoituna.
// Rivin klikkaus vie laitteen analyysinäkymään.
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api, type DeviceUnit } from '../api/client'
import { BreadcrumbNav } from '../components/Breadcrumb'

export type LaiteModaliteetti = 'us' | 'xray' | 'ct'

const CONFIG: Record<LaiteModaliteetti, {
  title: string
  label: string
  fetch: () => Promise<DeviceUnit[]>
  deviceLink: (u: DeviceUnit) => string
}> = {
  us: {
    title: 'Ultraäänilaitteet', label: 'Ultraääni',
    fetch: () => api.usUnits(),
    deviceLink: (u) => `/us/device/${encodeURIComponent(u.station_name)}`,
  },
  xray: {
    title: 'Natiiviröntgenlaitteet', label: 'Natiiviröntgen',
    fetch: () => api.xrayUnits(),
    deviceLink: (u) => `/xray/device/${encodeURIComponent(u.institution_name)}/${encodeURIComponent(u.station_name)}`,
  },
  ct: {
    title: 'TT-laitteet', label: 'Tietokonetomografia',
    fetch: () => api.ctUnits(),
    deviceLink: (u) => `/ct/device/${encodeURIComponent(u.station_name)}`,
  },
}

export default function LaitteetModaliteetti({ modality }: { modality: LaiteModaliteetti }) {
  const cfg = CONFIG[modality]
  const { data: units, isLoading, error } = useQuery<DeviceUnit[]>({
    queryKey: ['laitteet', modality],
    queryFn: cfg.fetch,
  })

  if (isLoading) return <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>Ladataan...</p>

  if (error) {
    return (
      <div className="status-message status-error">
        <h4>Virhe ladattaessa laitteita</h4>
        <p>{(error as Error).message}</p>
        <Link to="/laitteet" className="btn-outline">Takaisin</Link>
      </div>
    )
  }

  return (
    <>
      <BreadcrumbNav items={[
        { label: 'Aloitus', path: '/' },
        { label: 'Laitteet', path: '/laitteet' },
        { label: cfg.label },
      ]} />

      <div className="page-header">
        <h1>{cfg.title}</h1>
        <p>Laitteet joilla on tehty analyysejä ({units?.length ?? 0} kpl).</p>
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
              units.map((u) => (
                <tr key={`${u.institution_name}-${u.station_name}`}>
                  <td>
                    <Link to={cfg.deviceLink(u)}>{u.station_name}</Link>
                  </td>
                  <td>{u.institution_name}</td>
                  <td className="hide-mobile">{u.manufacturer || '—'}</td>
                  <td className="hide-mobile">{u.manufacturer_model || '—'}</td>
                  <td className="hide-mobile">{u.last_measurement ? u.last_measurement.slice(0, 10) : '—'}</td>
                  <td>{u.measurement_count}</td>
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
