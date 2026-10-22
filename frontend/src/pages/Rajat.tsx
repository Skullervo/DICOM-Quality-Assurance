// =============================================================================
// pages/Rajat.tsx — Hyväksyttävyysrajojen (toleranssien) muokkaussivu (/rajat)
// =============================================================================
// Modaliteettivälilehdet (US/XR/CT/Angio); kunkin metriikan rajat muokattavissa
// rivitasolla: nominaali, ala-/yläraja, toimintaraja ja varoitusrajat. Tallennus
// (api.updateTolerance -> PUT -> DB) ja sen jälkeen välimuistin mitätöinti
// (['tolerances']) päivittää rajat heti myös trendikaavioihin ja laitesivuille.
// Pohjana näytetään config.ts:n metriikkalista; DB:n arvot täyttävät solut.
// =============================================================================

// Hyväksyttävyysrajojen muokkaussivu. Modaliteettivälilehdet; kunkin metriikan
// rajat (nominaali, ala-/yläraja, toimintaraja, varoitusrajat) muokattavissa.
// Tallennus -> PUT -> DB -> invalidointi ['tolerances'] -> trendikuvaajien
// rajaviivat päivittyvät automaattisesti.
import { useState, type CSSProperties } from 'react'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { api, type ToleranceUpdate } from '../api/client'
import { useTolerances } from '../lib/qa/useTolerances'
import { MODALITY_METRICS } from '../lib/qa/config'
import type { Modality } from '../lib/qa/types'
import { BreadcrumbNav } from '../components/Breadcrumb'

// Modaliteettivälilehdet (tunnus + näyttönimi).
const MODS: { key: Modality; label: string }[] = [
  { key: 'US', label: 'Ultrasound' },
  { key: 'XR', label: 'Radiography' },
  { key: 'CT', label: 'Computed tomography' },
  { key: 'ANGIO', label: 'Angiography' },
]

// Muokattavat rajakentät (taulukon sarakkeet + lomakkeen kentät).
const FIELDS = [
  { key: 'nominal', label: 'Nominal' },
  { key: 'lower_limit', label: 'Lower limit' },
  { key: 'upper_limit', label: 'Upper limit' },
  { key: 'action_limit', label: 'Action limit ±' },
  { key: 'lower_warn', label: 'Lower warning' },
  { key: 'upper_warn', label: 'Upper warning' },
] as const
type FieldKey = typeof FIELDS[number]['key']  // yksi rajakentän avain
type Form = Record<FieldKey, string>          // lomake pitää arvot merkkijonoina (syötekentät)
const emptyForm: Form = { nominal: '', lower_limit: '', upper_limit: '', action_limit: '', lower_warn: '', upper_warn: '' }

const inp: CSSProperties = {
  width: 76, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4,
  padding: '4px 6px', color: 'var(--text)', fontSize: '0.85rem', textAlign: 'right', boxSizing: 'border-box', fontFamily: 'var(--mono)',
}
const actionBtn = (v: 'primary' | 'ghost'): CSSProperties => ({
  border: v === 'primary' ? 'none' : '1px solid var(--border)',
  background: v === 'primary' ? '#5b5bd6' : 'transparent',
  color: v === 'primary' ? '#fff' : 'var(--text-muted)',
  borderRadius: 6, padding: '4px 10px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600,
})
const tabBtn = (active: boolean): CSSProperties => ({
  background: 'transparent', border: 'none', cursor: 'pointer', padding: '9px 14px', fontSize: 13.5,
  color: active ? 'var(--text)' : 'var(--text-muted)', fontWeight: active ? 600 : 400,
  borderBottom: active ? '2px solid var(--info)' : '2px solid transparent', marginBottom: -1,
})

// Muuntaa syötetyn tekstin numeroksi tai nulliksi (tyhjä = ei rajaa; pilkku -> piste).
const numOrNull = (s: string): number | null => {
  const t = s.trim()
  if (t === '') return null
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
// Näyttömuoto: null/undefined -> viiva, muuten luku tekstinä.
const fmt = (v: number | null | undefined) => (v == null ? '—' : String(v))

export default function Rajat() {
  const qc = useQueryClient()
  const { data: tolerances, isLoading } = useTolerances()  // DB:n toleranssit
  const [mod, setMod] = useState<Modality>('CT')           // valittu modaliteetti (välilehti)
  const [editing, setEditing] = useState<string | null>(null)  // muokkauksessa oleva metriikka-id
  const [form, setForm] = useState<Form>(emptyForm)

  // Tallennus (PUT): päivittää valitun modaliteetin yhden metriikan rajat.
  const mutation = useMutation({
    mutationFn: (vars: { metric: string; data: ToleranceUpdate }) => api.updateTolerance(mod, vars.metric, vars.data),
    // Onnistuttua sulje muokkaus ja mitätöi toleranssivälimuisti -> kaikki näkymät päivittyvät.
    onSuccess: () => { setEditing(null); qc.invalidateQueries({ queryKey: ['tolerances'] }) },
  })

  // Etsii yhden metriikan tallennetut rajat valitulle modaliteetille.
  const tolFor = (id: string) => tolerances?.find((t) => t.modality === mod && t.metric_id === id)

  // Aloita muokkaus: täytä lomake DB:n nykyarvoilla (tyhjä jos arvoa ei ole).
  const startEdit = (id: string) => {
    const t = tolFor(id)
    setEditing(id)
    setForm({
      nominal: t?.nominal != null ? String(t.nominal) : '',
      lower_limit: t?.lower_limit != null ? String(t.lower_limit) : '',
      upper_limit: t?.upper_limit != null ? String(t.upper_limit) : '',
      action_limit: t?.action_limit != null ? String(t.action_limit) : '',
      lower_warn: t?.lower_warn != null ? String(t.lower_warn) : '',
      upper_warn: t?.upper_warn != null ? String(t.upper_warn) : '',
    })
  }
  // Yleispäivittäjä yhdelle lomakekentälle.
  const upd = (k: FieldKey) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))
  // Tallenna: muunna tekstikentät numeroiksi/nulleiksi ja lähetä.
  const save = (id: string) => mutation.mutate({
    metric: id,
    data: {
      nominal: numOrNull(form.nominal), lower_limit: numOrNull(form.lower_limit), upper_limit: numOrNull(form.upper_limit),
      action_limit: numOrNull(form.action_limit), lower_warn: numOrNull(form.lower_warn), upper_warn: numOrNull(form.upper_warn),
    },
  })

  return (
    <>
      <BreadcrumbNav items={[{ label: 'Home', path: '/' }, { label: 'Tolerances' }]} />

      <div className="page-header">
        <h1>Tolerances</h1>
        <p>Edit the analysis limits for each modality. Changes are saved to the database and update the trend charts.</p>
      </div>

      {/* Modaliteettivälilehdet */}
      <div role="tablist" style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        {MODS.map((m) => (
          <button key={m.key} role="tab" aria-selected={mod === m.key}
            onClick={() => { setMod(m.key); setEditing(null) }} style={tabBtn(mod === m.key)}>
            {m.label}
          </button>
        ))}
      </div>

      {mutation.isError && (
        <div className="status-message status-error" style={{ marginBottom: 12 }}>
          Save failed: {(mutation.error as Error).message}
        </div>
      )}

      {isLoading ? (
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>Loading...</p>
      ) : (
        <div className="table-container">
          <table className="modern-table">
            <thead>
              <tr>
                <th>Metric</th>
                {FIELDS.map((f) => <th key={f.key} style={{ textAlign: 'right' }}>{f.label}</th>)}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {/* Rivi per metriikka (config.ts:n lista); solut täytetään DB-arvoilla tai muokkauskentillä. */}
              {MODALITY_METRICS[mod].map((cfg) => {
                const t = tolFor(cfg.id)           // tämän metriikan DB-rajat (tai undefined)
                const isEd = editing === cfg.id    // onko rivi muokkaustilassa
                return (
                  <tr key={cfg.id}>
                    <td>
                      {cfg.label}{cfg.unit ? <span style={{ color: 'var(--text-faint)' }}> [{cfg.unit}]</span> : null}
                    </td>
                    {/* Jokaiselle rajakentälle solu: muokkaustilassa syöte, muuten DB-arvo. */}
                    {FIELDS.map((f) => (
                      <td key={f.key} className="num" style={{ textAlign: 'right' }}>
                        {isEd
                          ? <input value={form[f.key]} onChange={upd(f.key)} inputMode="decimal" aria-label={`${cfg.label} ${f.label}`} style={inp} />
                          : fmt(t?.[f.key])}
                      </td>
                    ))}
                    <td>
                      {isEd ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => save(cfg.id)} disabled={mutation.isPending} style={actionBtn('primary')}>
                            {mutation.isPending ? 'Saving…' : 'Save'}
                          </button>
                          <button onClick={() => setEditing(null)} disabled={mutation.isPending} style={actionBtn('ghost')}>Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => startEdit(cfg.id)} disabled={editing !== null} style={actionBtn('ghost')}>Edit</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
