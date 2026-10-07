import { useEffect, useState, type CSSProperties } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { markIntroSeen } from '../auth/introSeen'
import './auth.css'

// CSS-muuttuja piirtymisviiveelle (stroke-dashoffset-animaation animation-delay)
const d = (v: string): CSSProperties => ({ '--d': v } as CSSProperties)

// Intro: pehmeä himmennin-/optiikkamotiivi (aperture/iris) piirtyy esiin —
// kuusi terää muodostavat aukon, keskellä hohtava ydin — minkä päälle ilmestyy
// "Radiqa", ja sitten siirrytään kirjautumiseen.
export default function Intro() {
  const navigate = useNavigate()
  const { isAuthed } = useAuth()
  const [leaving, setLeaving] = useState(false)

  const goToLogin = () => { markIntroSeen(); navigate('/login', { replace: true }) }

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const total = reduce ? 1400 : 4300
    const t1 = setTimeout(() => setLeaving(true), total - 600)
    const t2 = setTimeout(goToLogin, total)
    return () => { clearTimeout(t1); clearTimeout(t2) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate])

  if (isAuthed) return <Navigate to="/" replace />

  return (
    <div className={`intro-root${leaving ? ' leaving' : ''}`} onClick={goToLogin}>
      <div className="intro-stage">
        <svg className="aperture" viewBox="0 0 440 440" role="img" aria-label="Radiqa">
          {/* Linssin reuna */}
          <circle className="rim draw" style={d('0s')} pathLength={1} cx={220} cy={220} r={195} />
          {/* Himmentimen aukko (kuusikulmio) */}
          <path className="opening draw" style={d('0.4s')} pathLength={1}
            d="M282.35,184 L220,148 L157.65,184 L157.65,256 L220,292 L282.35,256 Z" />
          {/* Terät — aukon kärjistä kehälle, kevyt kierre */}
          <path className="blade draw" style={d('0.75s')} pathLength={1} d="M282.35,184 L286.7,36.8" />
          <path className="blade draw" style={d('0.85s')} pathLength={1} d="M220,148 L94.7,70.6" />
          <path className="blade draw" style={d('0.95s')} pathLength={1} d="M157.65,184 L28,253.9" />
          <path className="blade draw" style={d('1.05s')} pathLength={1} d="M157.65,256 L153.3,403.2" />
          <path className="blade draw" style={d('1.15s')} pathLength={1} d="M220,292 L345.3,369.4" />
          <path className="blade draw" style={d('1.25s')} pathLength={1} d="M282.35,256 L412,186.1" />
          {/* Hohtava ydin */}
          <circle className="core" cx={220} cy={220} r={7} />
        </svg>

        <div className="intro-title">
          <h1>Radi<span className="accent">qa</span></h1>
          <p>Medical imaging quality assurance</p>
        </div>
      </div>
    </div>
  )
}
