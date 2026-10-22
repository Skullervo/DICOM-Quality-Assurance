// =============================================================================
// auth/RequireAuth.tsx — Portti suojatuille reiteille
// =============================================================================
// Käytetään App.tsx:ssä kääreenä kaikkien suojattujen reittien ympärillä.
// Jos käyttäjä on kirjautunut, näytetään pyydetty sivu (<Outlet/> = alireitti).
// Muuten käyttäjä ohjataan intro-sivulle, josta päätyy kirjautumiseen.
// =============================================================================

import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './authContext'

// Suojaa sovelluksen reitit: kirjautumaton käyttäjä ohjataan introon,
// joka johtaa kirjautumiseen.
export default function RequireAuth() {
  const { isAuthed } = useAuth()
  // Kirjautunut -> näytä alireitti; muuten uudelleenohjaus introon.
  // replace = ei jätä suojattua osoitetta selaimen historiaan.
  return isAuthed ? <Outlet /> : <Navigate to="/intro" replace />
}
