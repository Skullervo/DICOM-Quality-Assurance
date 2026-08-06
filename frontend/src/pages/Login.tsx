import { useState, type FormEvent } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { introSeen } from '../auth/introSeen'
import './auth.css'

export default function Login() {
  const navigate = useNavigate()
  const { isAuthed, login } = useAuth()
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState(false)

  // Jo kirjautunut -> suoraan sovellukseen
  if (isAuthed) return <Navigate to="/" replace />
  // Tuore sivulataus (esim. selaimen päivitys) ennen kirjautumista -> aja intro uudelleen
  if (!introSeen()) return <Navigate to="/intro" replace />

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (login(user, pass)) {
      navigate('/', { replace: true })
    } else {
      setError(true)
    }
  }

  return (
    <div className="login-root">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="login-brand">
          <svg width="46" height="46" viewBox="0 0 44 44" aria-hidden style={{ display: 'inline-block' }}>
            <circle cx="22" cy="23" r="18" fill="none" stroke="#c8ac74" strokeWidth="1.4" />
            <rect x="7" y="8" width="30" height="30" fill="none" stroke="#b7965c" strokeWidth="1.2" opacity="0.7" />
            <circle cx="22" cy="12" r="3.4" fill="none" stroke="#c8ac74" strokeWidth="1.4" />
            <path d="M22,15 L22,30 M12,18 L32,18 M14,12 L30,12 M17,30 L13,40 M27,30 L31,40"
              fill="none" stroke="#c8ac74" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <h1>Vitrovius<span className="mark">QA</span></h1>
          <p>Kirjaudu sisään</p>
        </div>

        {error && <p className="login-error">Väärä käyttäjätunnus tai salasana.</p>}

        <div className="login-field">
          <label htmlFor="login-user">Käyttäjätunnus</label>
          <input id="login-user" type="text" autoComplete="username" autoFocus
            value={user} onChange={(e) => { setUser(e.target.value); setError(false) }} />
        </div>
        <div className="login-field">
          <label htmlFor="login-pass">Salasana</label>
          <input id="login-pass" type="password" autoComplete="current-password"
            value={pass} onChange={(e) => { setPass(e.target.value); setError(false) }} />
        </div>

        <button className="login-btn" type="submit">Kirjaudu</button>
      </form>
    </div>
  )
}
