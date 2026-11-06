// =============================================================================
// pages/LaitteetModaliteetti.tsx — Yhden modaliteetin laitetaulukko (/laitteet/:mod)
// =============================================================================
// Sama komponentti palvelee kaikkia modaliteetteja (US/XR/CT/Angio); modality-
// prop valitsee CONFIG:sta oikean haun ja linkkimuodon. Listaa kaikki laitteet,
// joilla on analyysejä, ja sallii laitteen metatietojen MUOKKAUKSEN rivillä
// (asemanimi, laitos, valmistaja, malli). Tallennus (api.updateDevice) päivittää
// KAIKKI kyseisen laitteen mittausrivit tietokannassa, joten korjaus näkyy koko
// sivustolla. Onnistumisen jälkeen välimuisti mitätöidään -> näkymät päivittyvät.
// =============================================================================

// Modaliteettikohtainen laitetaulukko: listaa kaikki laitteet joilla on tehty
// analyysejä, oleelliset DICOM-tiedot taulukoituna. Laitteen metatiedot
// (laitetunnus, instituutio, valmistaja, malli) ovat muokattavissa (UPDATE);
// muutos päivittää kaikki laitteen mittausrivit DB:ssä ja koko sivustolle.
import { useState, type CSSProperties } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api, type DeviceUnit } from '../api/client'
import { BreadcrumbNav } from '../components/Breadcrumb'

export type LaiteModaliteetti = 'us' | 'xray' | 'ct' | 'angio'

// Modaliteettikohtaiset asetukset: otsikot, datahaku ja laitelinkin muodostus.
const CONFIG: Record<LaiteModaliteetti, {
  title: string
  label: string
  fetch: () => Promise<DeviceUnit[]>
  deviceLink: (u: DeviceUnit) => string
}> = {
  us: {
    title: 'Ultrasound devices', label: 'Ultrasound',
    fetch: () => api.usUnits(),
    deviceLink: (u) => `/us/device/${encodeURIComponent(u.station_name)}`,
  },
  xray: {
    title: 'Radiography devices', label: 'Radiography',
    fetch: () => api.xrayUnits(),
    deviceLink: (u) => `/xray/device/${encodeURIComponent(u.institution_name)}/${encodeURIComponent(u.station_name)}`,
  },
  ct: {
    title: 'CT devices', label: 'Computed tomography',
    fetch: () => api.ctUnits(),
    deviceLink: (u) => `/ct/device/${encodeURIComponent(u.station_name)}`,
  },
  angio: {
    title: 'Angiography devices', label: 'Angiography',
    fetch: () => api.angioUnits(),
    deviceLink: (u) => `/angio/device/${encodeURIComponent(u.institution_name)}/${encodeURIComponent(u.station_name)}`,
  },
}

// Muokkauslomakkeen kentät (yhden laitteen metatiedot).
type Form = { station_name: string; institution_name: string; manufacturer: string; manufacturer_model: string }
// Tekstikentän tyyli muokkaustilassa.
const inp: CSSProperties = {
  width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4,
  padding: '4px 6px', color: 'var(--text)', fontSize: '0.85rem', boxSizing: 'border-box', fontFamily: 'var(--sans)',
}
const actionBtn = (variant: 'primary' | 'ghost'): CSSProperties => ({
  border: variant === 'primary' ? 'none' : '1px solid var(--border)',
  background: variant === 'primary' ? '#5b5bd6' : 'transparent',
  color: variant === 'primary' ? '#fff' : 'var(--text-muted)',
  borderRadius: 6, padding: '4px 10px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600,
})

export default function LaitteetModaliteetti({ modality }: { modality: LaiteModaliteetti }) {
  const cfg = CONFIG[modality]            // valitun modaliteetin asetukset
  const qc = useQueryClient()             // välimuistin hallintaan (invalidointi tallennuksen jälkeen)
  const [editing, setEditing] = useState<string | null>(null)  // minkä laitteen rivi on muokkauksessa
  const [form, setForm] = useState<Form>({ station_name: '', institution_name: '', manufacturer: '', manufacturer_model: '' })

  // Hae modaliteetin laitteet.
  const { data: units, isLoading, error } = useQuery<DeviceUnit[]>({
    queryKey: ['laitteet', modality],
    queryFn: cfg.fetch,
  })

  // Tallennus (PUT): päivittää laitteen metatiedot backendissä.
  const mutation = useMutation({
    mutationFn: (vars: { oldStation: string; data: Form }) => api.updateDevice(modality, vars.oldStation, vars.data),
    onSuccess: () => {
      setEditing(null)  // sulje muokkaus
      // Mitätöi sekä laitelista että laitesivut, jotta muutos näkyy kaikkialla.
      qc.invalidateQueries({ queryKey: ['laitteet', modality] }) // laitelista
      qc.invalidateQueries({ queryKey: [modality] })             // laitesivut/data (esim. ['ct','device',...])
    },
  })

  // Aloita rivin muokkaus: täytä lomake laitteen nykyarvoilla.
  const startEdit = (u: DeviceUnit) => {
    setEditing(u.station_name)
    setForm({
      station_name: u.station_name, institution_name: u.institution_name,
      manufacturer: u.manufacturer, manufacturer_model: u.manufacturer_model,
    })
  }
  // Yleispäivittäjä yhdelle lomakekentälle (k = kentän nimi).
  const upd = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  if (isLoading) return <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>Loading...</p>

  if (error) {
    return (
      <div className="status-message status-error">
        <h4>Error loading devices</h4>
        <p>{(error as Error).message}</p>
        <Link to="/laitteet" className="btn-outline">Back</Link>
      </div>
    )
  }

  return (
    <>
      <BreadcrumbNav items={[
        { label: 'Home', path: '/' },
        { label: 'Devices', path: '/laitteet' },
        { label: cfg.label },
      ]} />

      <div className="page-header">
        <h1>{cfg.title}</h1>
        <p>Devices that have been analyzed ({units?.length ?? 0} total). Edit a device's metadata with the "Edit" button.</p>
      </div>

      {mutation.isError && (
        <div className="status-message status-error" style={{ marginBottom: 12 }}>
          Save failed: {(mutation.error as Error).message}
        </div>
      )}

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
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {units && units.length > 0 ? (
              units.map((u) => {
                const isEd = editing === u.station_name  // onko tämä rivi muokkaustilassa
                return (
                  <tr key={`${u.institution_name}-${u.station_name}`}>
                    {/* Jokainen solu: muokkaustilassa syötekenttä, muuten pelkkä arvo/linkki. */}
                    <td>
                      {isEd
                        ? <input value={form.station_name} onChange={upd('station_name')} aria-label="Device ID" style={inp} />
                        : <Link to={cfg.deviceLink(u)}>{u.station_name}</Link>}
                    </td>
                    <td>
                      {isEd
                        ? <input value={form.institution_name} onChange={upd('institution_name')} aria-label="Institution" style={inp} />
                        : (u.institution_name || '')}
                    </td>
                    <td className="hide-mobile">
                      {isEd
                        ? <input value={form.manufacturer} onChange={upd('manufacturer')} aria-label="Manufacturer" style={inp} />
                        : (u.manufacturer || '')}
                    </td>
                    <td className="hide-mobile">
                      {isEd
                        ? <input value={form.manufacturer_model} onChange={upd('manufacturer_model')} aria-label="Model" style={inp} />
                        : (u.manufacturer_model || '')}
                    </td>
                    <td className="hide-mobile">{u.last_measurement ? u.last_measurement.slice(0, 10) : ''}</td>
                    <td>{u.measurement_count}</td>
                    <td>
                      {/* Muokkaustilassa Tallenna/Peruuta, muuten Muokkaa (estetty jos toinen rivi muokkauksessa). */}
                      {isEd ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          {/* Tallennus estetty jos asemanimi on tyhjä tai tallennus kesken. */}
                          <button onClick={() => mutation.mutate({ oldStation: u.station_name, data: form })}
                            disabled={mutation.isPending || !form.station_name.trim()} style={actionBtn('primary')}>
                            {mutation.isPending ? 'Saving…' : 'Save'}
                          </button>
                          <button onClick={() => setEditing(null)} disabled={mutation.isPending} style={actionBtn('ghost')}>Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => startEdit(u)} disabled={editing !== null} style={actionBtn('ghost')}>Edit</button>
                      )}
                    </td>
                  </tr>
                )
              })
            ) : (
              <tr><td colSpan={7}>No devices available.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
