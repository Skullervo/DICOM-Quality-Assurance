import { describe, it, expect } from 'vitest'
import { buildMetrics, numOrNull, formatDay } from './adapt'
import { deriveStatus } from './status'

describe('numOrNull', () => {
  it('parsii numerot ja merkkijononumerot', () => {
    expect(numOrNull(3.5)).toBe(3.5)
    expect(numOrNull('12')).toBe(12)
    expect(numOrNull('')).toBeNull()
    expect(numOrNull(null)).toBeNull()
    expect(numOrNull('abc')).toBeNull()
    expect(numOrNull(Number.NaN)).toBeNull()
  })
})

describe('formatDay', () => {
  it('muotoilee DICOM-päivän', () => {
    expect(formatDay('20240924')).toBe('24.09.2024')
    expect(formatDay('2024-09-24')).toBe('24.09.2024')
  })
  it('palauttaa undefined tyhjälle', () => {
    expect(formatDay(null)).toBeUndefined()
    expect(formatDay('')).toBeUndefined()
  })
})

describe('buildMetrics', () => {
  it('poimii arvon rivistä metriikan id:llä (CT HU)', () => {
    const metrics = buildMetrics('CT', { hu_air: -1015, hu_teflon: 953 }, [])
    const air = metrics.find((m) => m.id === 'hu_air')!
    expect(air.value).toBe(-1015)
    expect(air.nominal).toBe(-1000)
    expect(deriveStatus(air)).toBe('pass') // Δ15 < toimintaraja 20

    const teflon = metrics.find((m) => m.id === 'hu_teflon')!
    expect(teflon.value).toBe(953) // Δ37: > toimintaraja 20, < hyväksymisraja 40
    expect(deriveStatus(teflon)).toBe('warn')
  })

  it('null latest -> kaikki value null', () => {
    const metrics = buildMetrics('US', null, [])
    expect(metrics.every((m) => m.value === null)).toBe(true)
  })

  it('rakentaa historian ja suodattaa puuttuvat arvot', () => {
    const hist = [
      { study_date: '20240801', u_cov: 3 },
      { study_date: '20240901', u_cov: null },
      { study_date: '20241001', u_cov: 5 },
    ]
    const ucov = buildMetrics('US', { u_cov: 5 }, hist).find((m) => m.id === 'u_cov')!
    expect(ucov.history).toHaveLength(2)
    expect(ucov.history[0]).toEqual({ date: '20240801', value: 3, idx: 0 })
    expect(ucov.history[1]).toEqual({ date: '20241001', value: 5, idx: 2 }) // idx säilyy nullin yli
  })
})
