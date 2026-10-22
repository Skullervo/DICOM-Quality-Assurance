// =============================================================================
// auth/authContext.ts — Kirjautumistilan React-konteksti ja useAuth-hook
// =============================================================================
// Määrittelee "kontekstin", jonka kautta mikä tahansa komponentti saa tietää
// onko käyttäjä kirjautunut sekä pääsee kirjautumaan sisään/ulos. Itse tilan
// toteutus (arvojen tuottaminen) on AuthProvider.tsx:ssä; tämä tiedosto tarjoaa
// vain tyypit, itse kontekstin ja kätevän useAuth-hookin.
// =============================================================================

import { createContext, useContext } from 'react'

// Kirjautumistilan muoto: onko kirjautunut + funktiot kirjautumiseen ja uloskirjautumiseen.
export interface AuthState {
  isAuthed: boolean
  login: (user: string, pass: string) => boolean
  logout: () => void
}

// Itse konteksti. Oletusarvo null = ei vielä AuthProviderin sisällä.
export const AuthContext = createContext<AuthState | null>(null)

// Hook, jolla komponentti saa kirjautumistilan käyttöönsä.
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  // Jos hookia käytetään ilman AuthProvideria, se on ohjelmointivirhe -> heitetään selkeä virhe.
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
