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
            <circle cx="22" cy="22" r="19" fill="none" stroke="#6fd3f0" strokeWidth="1.3" opacity="0.6" />
            <path d="M28.06,18.5 L22,15 L15.94,18.5 L15.94,25.5 L22,29 L28.06,25.5 Z"
              fill="none" stroke="#aef0ff" strokeWidth="1.6" strokeLinejoin="round" opacity="0.9" />
            <path d="M28.06,18.5 L30,8 M22,15 L12.5,10 M15.94,18.5 L6,23 M15.94,25.5 L15,37 M22,29 L31,35 M28.06,25.5 L38,20"
              fill="none" stroke="#4bb8e0" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
            <circle cx="22" cy="22" r="1.7" fill="#cdefff" />
          </svg>
          <h1>Radi<span className="mark">qa</span></h1>
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
