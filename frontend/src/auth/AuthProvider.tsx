// =============================================================================
// auth/AuthProvider.tsx — Kirjautumistilan toteutus (tarjoaa AuthContext-arvon)
// =============================================================================
// Tämä komponentti kääritään koko sovelluksen ympärille (ks. App.tsx) ja se
// pitää kirjaa siitä, onko käyttäjä kirjautunut. Tila säilytetään selaimen
// sessionStorageissa, joten se pysyy sivunvaihdossa mutta nollautuu kun
// selainvälilehti suljetaan.
//
// TÄRKEÄÄ: tämä on vain kevyt käyttöliittymäportti, EI oikea tietoturva —
// tunnukset tarkistetaan selaimessa. Varsinainen suojaus kuuluu backendille.
// =============================================================================

import { useState, type ReactNode } from 'react'
import { AuthContext } from './authContext'

// Kevyt frontend-portti. HUOM: tämä EI suojaa API:a — tunnukset ovat selaimen
// puolella ja tarkoitettu vain käyttöliittymän porttaamiseen (sisäinen käyttö).
// Oikea suojaus vaatii backend-autentikoinnin (go-backend/middleware/auth.go).
const KEY = 'radiqa-auth'  // Avain, jolla kirjautumistila talletetaan sessionStorageen.
// Kelvolliset tunnukset luetaan ympäristömuuttujista; oletukset vain kehitystä varten.
const VALID_USER = String(import.meta.env.VITE_LOGIN_USER ?? 'admin')
const VALID_PASS = String(import.meta.env.VITE_LOGIN_PASSWORD ?? 'radiqa')

export function AuthProvider({ children }: { children: ReactNode }) {
  // Alkutila luetaan sessionStoragesta: '1' tarkoittaa että käyttäjä on jo kirjautunut.
  const [isAuthed, setAuthed] = useState<boolean>(() => sessionStorage.getItem(KEY) === '1')

  // Tarkistaa tunnukset. Oikeilla tunnuksilla merkitsee kirjautuneeksi ja palauttaa true.
  const login = (user: string, pass: string): boolean => {
    if (user.trim() === VALID_USER && pass === VALID_PASS) {
      sessionStorage.setItem(KEY, '1')
      setAuthed(true)
      return true
    }
    return false  // Väärät tunnukset -> ei kirjauduta.
  }

  // Kirjaa ulos: poistaa tiedon sessionStoragesta ja nollaa tilan.
  const logout = () => {
    sessionStorage.removeItem(KEY)
    setAuthed(false)
  }

  // Tarjoaa kirjautumistilan ja funktiot kaikille lapsikomponenteille.
  return <AuthContext.Provider value={{ isAuthed, login, logout }}>{children}</AuthContext.Provider>
}
