// Modaliteettikohtainen mittaustaulukko: listaa KAIKKI Orthanc-mittaukset ja
// merkitsee analyysin tilan (Analysoitu / Epäonnistui). Epäonnistuneet eivät
// ole DB:ssä — ne tulevat Orthancista ja tila ristiinviitataan analyysitauluun.
import { useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api, type Measurement } from '../api/client'
import { BreadcrumbNav } from '../components/Breadcrumb'

export type MittausModaliteetti = 'us' | 'xray' | 'ct'

const CONFIG: Record<MittausModaliteetti, {
  title: string
  label: string
  deviceLink: (m: Measurement) => string
}> = {
  us: { title: 'Ultraäänimittaukset', label: 'Ultraääni', deviceLink: (m) => `/us/device/${encodeURIComponent(m.station_name)}` },
  xray: { title: 'Natiiviröntgenmittaukset', label: 'Natiiviröntgen', deviceLink: (m) => `/xray/device/${encodeURIComponent(m.institution_name)}/${encodeURIComponent(m.station_name)}` },
  ct: { title: 'TT-mittaukset', label: 'Tietokonetomografia', deviceLink: (m) => `/ct/device/${encodeURIComponent(m.station_name)}` },
}

const fmtDate = (d: string) => (d && d.length >= 8 ? `${d.slice(6, 8)}.${d.slice(4, 6)}.${d.slice(0, 4)}` : (d || '—'))

const pill = (ok: boolean): CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', fontWeight: 600,
  padding: '2px 9px', borderRadius: 10, whiteSpace: 'nowrap',
  color: ok ? 'var(--pass)' : 'var(--fail)', background: ok ? 'var(--pass-bg)' : 'var(--fail-bg)',
  border: `1px solid color-mix(in srgb, ${ok ? 'var(--pass)' : 'var(--fail)'} 40%, transparent)`,
})
const filterBtn = (active: boolean): CSSProperties => ({
  background: active ? 'var(--surface-2)' : 'transparent', border: `1px solid ${active ? 'var(--info)' : 'var(--border)'}`,
  color: active ? 'var(--text)' : 'var(--text-muted)', borderRadius: 8, padding: '5px 12px', fontSize: 13, cursor: 'pointer',
})

type Filter = 'all' | 'analyzed' | 'failed'

export default function MittauksetModaliteetti({ modality }: { modality: MittausModaliteetti }) {
  const cfg = CONFIG[modality]
  const [filter, setFilter] = useState<Filter>('all')

  const { data, isLoading, error } = useQuery<Measurement[]>({
    queryKey: ['mittaukset', modality],
    queryFn: () => api.measurements(modality),
  })

  if (isLoading) return <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>Ladataan...</p>

  if (error) {
    return (
      <div className="status-message status-error">
        <h4>Virhe ladattaessa mittauksia</h4>
        <p>{(error as Error).message}</p>
        <Link to="/mittaukset" className="btn-outline">Takaisin</Link>
      </div>
    )
  }

  const all = data ?? []
  const nAnalyzed = all.filter((m) => m.status === 'analyzed').length
  const nFailed = all.length - nAnalyzed
  const rows = [...all]
    .filter((m) => filter === 'all' || m.status === filter)
    .sort((a, b) => (b.study_date || '').localeCompare(a.study_date || ''))

  return (
    <>
      <BreadcrumbNav items={[
        { label: 'Aloitus', path: '/' },
        { label: 'Mittaukset', path: '/mittaukset' },
        { label: cfg.label },
      ]} />

      <div className="page-header">
        <h1>{cfg.title}</h1>
        <p>{all.length} mittausta — {nAnalyzed} analysoitu, {nFailed} epäonnistui/kesken.</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setFilter('all')} style={filterBtn(filter === 'all')}>Kaikki ({all.length})</button>
        <button onClick={() => setFilter('analyzed')} style={filterBtn(filter === 'analyzed')}>Analysoitu ({nAnalyzed})</button>
        <button onClick={() => setFilter('failed')} style={filterBtn(filter === 'failed')}>Epäonnistui ({nFailed})</button>
      </div>

      <div className="table-container">
        <table className="modern-table">
          <thead>
            <tr>
              <th>Laite</th>
              <th>Instituutio</th>
              <th className="hide-mobile">Pvm</th>
              <th className="hide-mobile">Valmistaja</th>
              <th className="hide-mobile">Malli</th>
              <th>Tila</th>
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((m) => (
                <tr key={m.orthanc_id}>
                  <td>
                    {m.status === 'analyzed'
                      ? <Link to={cfg.deviceLink(m)}>{m.station_name || '—'}</Link>
                      : (m.station_name || '—')}
                  </td>
                  <td>{m.institution_name || '—'}</td>
                  <td className="hide-mobile">{fmtDate(m.study_date)}</td>
                  <td className="hide-mobile">{m.manufacturer || '—'}</td>
                  <td className="hide-mobile">{m.manufacturer_model || '—'}</td>
                  <td>
                    <span style={pill(m.status === 'analyzed')}>
                      {m.status === 'analyzed' ? 'Analysoitu' : 'Epäonnistui'}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={6}>Ei mittauksia.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
