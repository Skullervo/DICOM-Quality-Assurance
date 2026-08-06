import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './authContext'

// Suojaa sovelluksen reitit: kirjautumaton käyttäjä ohjataan introon,
// joka johtaa kirjautumiseen.
export default function RequireAuth() {
  const { isAuthed } = useAuth()
  return isAuthed ? <Outlet /> : <Navigate to="/intro" replace />
}
