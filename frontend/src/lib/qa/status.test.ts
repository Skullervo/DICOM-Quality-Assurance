// =============================================================================
// lib/qa/status.test.ts — Yksikkötestit status.ts:lle (Vitest)
// =============================================================================
// Testaa toleranssilogiikan ydinkohdat: statuksen johtaminen symmetrisistä ja
// yksipuolisista rajoista, kokonaisverdiktin "korkein vakavuus voittaa" -sääntö
// sekä lukujen muotoiluapurit. Testit dokumentoivat samalla rajatapaukset
// (esim. arvo tasan rajalla ei vielä hylkää).
// =============================================================================

import { describe, it, expect } from 'vitest'
import { deriveStatus, deriveVerdict, symmetricLimits, fmt, fmtDelta, type StatusInput } from './status'

// Apuri: symmetrinen HU-tyylinen metriikka (nominaali ±tol, toimintaraja ±action)
const hu = (value: number | null, nominal = -1000, tol = 40, action = 20): StatusInput => ({
  value,
  ...symmetricLimits(nominal, tol, action),
})

describe('deriveStatus — symmetrinen (HU)', () => {
  it('nodata kun value puuttuu tai NaN', () => {
    expect(deriveStatus(hu(null))).toBe('nodata')
    expect(deriveStatus(hu(Number.NaN))).toBe('nodata')
  })
  it('pass kun poikkeama <= toimintaraja', () => {
    expect(deriveStatus(hu(-1000))).toBe('pass') // Δ0
    expect(deriveStatus(hu(-1020))).toBe('pass') // Δ20 == action, ei ylitä
  })
  it('warn kun toimintaraja < poikkeama <= hyväksymisraja', () => {
    expect(deriveStatus(hu(-1021))).toBe('warn') // Δ21
    expect(deriveStatus(hu(-1040))).toBe('warn') // Δ40 == tol, ei ylitä -> yhä warn
    expect(deriveStatus(hu(-960))).toBe('warn') // toinen suunta Δ40
  })
  it('fail kun poikkeama > hyväksymisraja (kumpi tahansa suunta)', () => {
    expect(deriveStatus(hu(-1041))).toBe('fail') // alle lowerLimit
    expect(deriveStatus(hu(-959))).toBe('fail') // yli upperLimit
  })
})

describe('deriveStatus — yksipuolinen (MTF: matalampi huonompi)', () => {
  const mtf = (value: number | null): StatusInput => ({
    value, nominal: null, lowerLimit: 1.5, upperLimit: null, lowerWarn: 1.8,
  })
  it('pass korkealla arvolla', () => expect(deriveStatus(mtf(2.0))).toBe('pass'))
  it('warn lowerWarn ja lowerLimit välissä', () => {
    expect(deriveStatus(mtf(1.7))).toBe('warn')
    expect(deriveStatus(mtf(1.5))).toBe('warn') // == lowerLimit, ei alle -> warn (< lowerWarn)
  })
  it('fail lowerLimitin alle', () => expect(deriveStatus(mtf(1.4))).toBe('fail'))
})

describe('deriveStatus — yksipuolinen (poikkeama: isompi huonompi)', () => {
  const unif = (value: number | null): StatusInput => ({
    value, nominal: 0, lowerLimit: null, upperLimit: 10, upperWarn: 5,
  })
  it('pass pienellä poikkeamalla', () => expect(deriveStatus(unif(3))).toBe('pass'))
  it('warn upperWarn ja upperLimit välissä', () => expect(deriveStatus(unif(7))).toBe('warn'))
  it('fail upperLimitin yli', () => expect(deriveStatus(unif(12))).toBe('fail'))
})

describe('deriveVerdict — korkein vakavuus voittaa', () => {
  it('kaikki pass -> pass', () => {
    const v = deriveVerdict([hu(-1000), hu(-1010)])
    expect(v.verdict).toBe('pass')
    expect(v).toMatchObject({ measured: 2, pass: 2, warn: 0, fail: 0, nodata: 0 })
  })
  it('yksi warn nostaa verdiktin warniksi', () => {
    expect(deriveVerdict([hu(-1000), hu(-1030)]).verdict).toBe('warn')
  })
  it('yksi fail voittaa warnin', () => {
    const v = deriveVerdict([hu(-1000), hu(-1030), hu(-1100)])
    expect(v.verdict).toBe('fail')
    expect(v).toMatchObject({ pass: 1, warn: 1, fail: 1 })
  })
  it('vain nodata -> nodata', () => {
    const v = deriveVerdict([hu(null), hu(null)])
    expect(v.verdict).toBe('nodata')
    expect(v).toMatchObject({ measured: 0, nodata: 2 })
  })
  it('nodata ei vaikuta verdiktiin jos mitattuja on', () => {
    expect(deriveVerdict([hu(-1000), hu(null)]).verdict).toBe('pass')
  })
  it('tyhjä lista -> nodata', () => {
    expect(deriveVerdict([]).verdict).toBe('nodata')
  })
})

describe('symmetricLimits', () => {
  it('rakentaa rajat nominaali ± tol', () => {
    expect(symmetricLimits(120, 10, 6)).toEqual({
      nominal: 120, lowerLimit: 110, upperLimit: 130, actionLimit: 6,
    })
  })
  it('jättää actionLimitin pois jos ei annettu', () => {
    expect(symmetricLimits(0, 5)).toEqual({ nominal: 0, lowerLimit: -5, upperLimit: 5 })
  })
})

describe('format-apurit', () => {
  it('fmt pyöristää ja käyttää typografista miinusta', () => {
    expect(fmt(-1015.4, 0)).toBe('−1015')
    expect(fmt(0.10499, 2)).toBe('0.10')
    expect(fmt(null, 2)).toBe('—')
  })
  it('fmtDelta lisää etumerkin', () => {
    expect(fmtDelta(15, 0)).toBe('+15')
    expect(fmtDelta(-37, 0)).toBe('−37')
    expect(fmtDelta(0, 1)).toBe('±0.0')
    expect(fmtDelta(null, 0)).toBe('—')
  })
})
