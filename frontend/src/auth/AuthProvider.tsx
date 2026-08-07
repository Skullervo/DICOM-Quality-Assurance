import { useState, type ReactNode } from 'react'
import { AuthContext } from './authContext'

// Kevyt frontend-portti. HUOM: tämä EI suojaa API:a — tunnukset ovat selaimen
// puolella ja tarkoitettu vain käyttöliittymän porttaamiseen (sisäinen käyttö).
// Oikea suojaus vaatii backend-autentikoinnin (go-backend/middleware/auth.go).
const KEY = 'radiqa-auth'
const VALID_USER = String(import.meta.env.VITE_LOGIN_USER ?? 'admin')
const VALID_PASS = String(import.meta.env.VITE_LOGIN_PASSWORD ?? 'radiqa')

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthed, setAuthed] = useState<boolean>(() => sessionStorage.getItem(KEY) === '1')

  const login = (user: string, pass: string): boolean => {
    if (user.trim() === VALID_USER && pass === VALID_PASS) {
      sessionStorage.setItem(KEY, '1')
      setAuthed(true)
      return true
    }
    return false
  }

  const logout = () => {
    sessionStorage.removeItem(KEY)
    setAuthed(false)
  }

  return <AuthContext.Provider value={{ isAuthed, login, logout }}>{children}</AuthContext.Provider>
}
