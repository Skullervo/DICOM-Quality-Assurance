import { useEffect, useState, type CSSProperties } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { markIntroSeen } from '../auth/introSeen'
import './auth.css'

// CSS-muuttuja piirtymisviiveelle (stroke-dashoffset-animaation animation-delay)
const d = (v: string): CSSProperties => ({ '--d': v } as CSSProperties)

// Oikea kuva (jos pudotettu kansioon frontend/public/): näytetään mieluummin
// kuin viivagrafiikka. Public domain -lähde: Wikimedia Commons "Vitruvian Man".
const IMG_SRC = `${import.meta.env.BASE_URL}vitruvius.jpg`

// Intro: Vitruviuksen ihminen piirtyy pikkuhiljaa esiin, sen päälle ilmestyy
// "VitroviusQA", minkä jälkeen siirrytään kirjautumiseen.
export default function Intro() {
  const navigate = useNavigate()
  const { isAuthed } = useAuth()
  const [leaving, setLeaving] = useState(false)
  // Viivagrafiikka näkyy heti; jos oikea kuva (public/vitruvius.jpg) latautuu,
  // se häivähtää sen päälle. Jos kuvaa ei ole (404), jää viivagrafiikka.
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)

  const goToLogin = () => { markIntroSeen(); navigate('/login', { replace: true }) }

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const total = reduce ? 1400 : 4300
    const t1 = setTimeout(() => setLeaving(true), total - 600)
    const t2 = setTimeout(goToLogin, total)
    return () => { clearTimeout(t1); clearTimeout(t2) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate])

  // Jos jo kirjautunut, ei näytetä introa.
  if (isAuthed) return <Navigate to="/" replace />

  return (
    <div className={`intro-root${leaving ? ' leaving' : ''}`} onClick={goToLogin}>
      <div className="intro-stage">
        {!imgFailed && (
          <img className={`vitr-img${imgLoaded ? ' loaded' : ''}`} src={IMG_SRC} alt="Vitruviuksen ihminen"
            onLoad={() => setImgLoaded(true)} onError={() => setImgFailed(true)} />
        )}
        <svg className={`vitruvian${imgLoaded ? ' hidden' : ''}`} viewBox="0 0 440 460" role="img" aria-label="VitroviusQA">
          {/* Kehykset: ympyrä + neliö */}
          <circle className="ink frame draw" style={d('0s')} pathLength={1} cx={220} cy={250} r={180} />
          <rect className="ink frame draw" style={d('0.3s')} pathLength={1} x={60} y={120} width={320} height={320} />

          {/* Pää */}
          <circle className="ink draw" style={d('1s')} pathLength={1} cx={220} cy={118} r={27} />
          {/* Selkäranka */}
          <path className="ink draw" style={d('1.1s')} pathLength={1} d="M220,146 L220,300" />
          {/* Hartiat */}
          <path className="ink draw" style={d('1.2s')} pathLength={1} d="M172,168 Q220,156 268,168" />
          {/* Vartalon reunat */}
          <path className="ink draw" style={d('1.25s')} pathLength={1} d="M182,170 L198,272" />
          <path className="ink draw" style={d('1.25s')} pathLength={1} d="M258,170 L242,272" />
          {/* Lantio */}
          <path className="ink draw" style={d('1.35s')} pathLength={1} d="M198,278 Q220,272 242,278" />

          {/* Kädet vaakatasossa (neliön reunoille) */}
          <path className="ink draw" style={d('1.4s')} pathLength={1} d="M176,167 L64,178" />
          <path className="ink draw" style={d('1.45s')} pathLength={1} d="M264,167 L376,178" />
          {/* Kädet ylhäällä (ympyrän kehälle) */}
          <path className="ink draw" style={d('1.55s')} pathLength={1} d="M180,165 L118,112" />
          <path className="ink draw" style={d('1.6s')} pathLength={1} d="M260,165 L322,112" />

          {/* Jalat yhdessä (jalkapohjat alhaalla) */}
          <path className="ink draw" style={d('1.55s')} pathLength={1} d="M212,300 L206,428" />
          <path className="ink draw" style={d('1.6s')} pathLength={1} d="M228,300 L234,428" />
          {/* Jalat haarallaan (ympyrän kehälle) */}
          <path className="ink draw" style={d('1.7s')} pathLength={1} d="M214,302 L138,404" />
          <path className="ink draw" style={d('1.75s')} pathLength={1} d="M226,302 L302,404" />

          {/* Jalkapohjat */}
          <path className="ink draw" style={d('1.85s')} pathLength={1} d="M196,428 L216,428" />
          <path className="ink draw" style={d('1.85s')} pathLength={1} d="M224,428 L244,428" />

          {/* Napa (ympyrän keskipiste) */}
          <circle className="dot" cx={220} cy={250} r={3.6} />
        </svg>

        <div className="intro-title">
          <h1>Vitrovius<span className="qa">QA</span></h1>
          <p>Lääketieteellisen kuvantamisen laadunvalvonta</p>
        </div>
      </div>
    </div>
  )
}
