// =============================================================================
// components/Layout.tsx — Koko sovelluksen yhteinen kehys (navigaatio + runko)
// =============================================================================
// Kaikki suojatut sivut renderöidään tämän sisään (ks. App.tsx). Layout tarjoaa:
//   - oikean yläkulman hampurilaisvalikon (navigointi), teemavaihdon ja uloskirjauksen,
//   - sisältöalueen (<Outlet/> = kulloinenkin sivu),
//   - alatunnisteen.
// Ulkoasu mukautuu sivutyypin mukaan: laitesivut saavat koko leveyden ilman
// kehystä, "kansisivut" (etusivu, Tietoa) oman asettelunsa, muut tavallisen.
// =============================================================================

import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Menu, LogOut } from 'lucide-react'
import { useAuth } from '../auth/authContext'

// Navigaatiovalikon kohdat. match = polut, joiden perusteella kohta näkyy aktiivisena;
// exact = kohta aktiivinen vain täsmälleen tällä polulla.
const navItems = [
  { path: '/', label: 'Home', exact: true },
  { path: '/modaliteetit', label: 'Modalities', match: ['/modaliteetit', '/us', '/xray', '/ct', '/angio'] },
  { path: '/laitteet', label: 'Devices', match: ['/laitteet'] },
  { path: '/mittaukset', label: 'Measurements', match: ['/mittaukset'] },
  { path: '/rajat', label: 'Tolerances', match: ['/rajat'] },
  { path: '/tietoa', label: 'About', exact: true },
]

// Lukee tallennetun teeman localStoragesta; oletuksena tumma.
function getTheme(): 'dark' | 'light' {
  return (localStorage.getItem('autoqad-theme') as 'dark' | 'light') || 'dark'
}

// Yhteinen tyyli yläkulman pyöreille painikkeille (valikko, teema, uloskirjaus).
const ctrlBtn: React.CSSProperties = {
  width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)',
  color: 'var(--text-muted)', cursor: 'pointer', fontSize: 15, lineHeight: 1,
}

export default function Layout() {
  const location = useLocation()       // nykyinen URL-polku
  const navigate = useNavigate()       // ohjelmallinen navigointi (esim. uloskirjauksen jälkeen)
  const { logout } = useAuth()
  const [theme, setTheme] = useState<'dark' | 'light'>(getTheme)  // valittu teema
  const [menuOpen, setMenuOpen] = useState(false)                 // onko navigaatiovalikko auki
  // Onko kyseessä laitteen tarkkasivu (näille annetaan koko leveys ilman kehystä).
  const isDevicePage = /\/(us\/device|xray\/device|ct\/device|angio\/device)\//.test(location.pathname)
  // "Kansisivut": etusivu ja Tietoa — oma pystysuuntainen asettelu.
  const isCoverPage = location.pathname === '/' || location.pathname === '/tietoa'

  // Kun teema muuttuu: aseta se dokumentin data-theme-attribuuttiin (CSS reagoi) ja tallenna.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('autoqad-theme', theme)
  }, [theme])

  // Vaihtaa teeman tummasta vaaleaan ja takaisin.
  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  // Päättää onko annettu navigaatiokohta "aktiivinen" nykyisellä polulla.
  const isActive = (item: typeof navItems[number]) => {
    if (item.exact) return location.pathname === item.path
    if (item.match) return item.match.some(p => location.pathname.startsWith(p))
    return location.pathname.startsWith(item.path)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - var(--app-inset) * 2)' }}>
      {/* Oikea yläkulma: navigaatio-pudotusvalikko + teema (ei enää yläpaneelia) */}
      <div style={{ position: 'fixed', top: 12, right: 18, zIndex: 2000, display: 'flex', gap: 6, alignItems: 'center' }}>
        <div style={{ position: 'relative' }}>
          {/* Hampurilaispainike avaa/sulkee navigaatiovalikon. */}
          <button onClick={() => setMenuOpen(o => !o)} aria-label="Navigation menu" aria-expanded={menuOpen} style={ctrlBtn}>
            <Menu size={18} aria-hidden />
          </button>
          {/* Pudotusvalikko näkyy vain kun menuOpen on tosi. */}
          {menuOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 180,
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
              padding: 4, boxShadow: '0 8px 24px rgba(0,0,0,.4)', display: 'flex', flexDirection: 'column', gap: 2,
            }}>
              {/* Yksi linkki per navigaatiokohta; aktiivinen kohta korostetaan väreillä. */}
              {navItems.map((item) => (
                <Link key={item.path} to={item.path} onClick={() => setMenuOpen(false)}
                  style={{
                    padding: '8px 12px', borderRadius: 6, fontSize: 13.5, textDecoration: 'none',
                    color: isActive(item) ? 'var(--info)' : 'var(--text)',
                    background: isActive(item) ? 'color-mix(in srgb, var(--info) 12%, transparent)' : 'transparent',
                  }}>
                  {item.label}
                </Link>
              ))}
            </div>
          )}
        </div>
        {/* Teeman vaihto (aurinko/kuu). */}
        <button onClick={toggleTheme} aria-label="Toggle theme" style={ctrlBtn}>
          {theme === 'dark' ? '☀' : '🌙'}
        </button>
        {/* Uloskirjaus: nollaa kirjautumistila ja ohjaa introon. */}
        <button onClick={() => { logout(); navigate('/intro', { replace: true }) }}
          aria-label="Log out" title="Log out" style={ctrlBtn}>
          <LogOut size={16} aria-hidden />
        </button>
      </div>

      {/* Klikkaus valikon ulkopuolelle sulkee sen */}
      {/* Läpinäkyvä koko ruudun peite, joka nappaa klikkauksen ja sulkee valikon. */}
      {menuOpen && (
        <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 1999 }} />
      )}

      {/* Sisältöalueen asettelu valitaan sivutyypin mukaan. */}
      {isDevicePage ? (
        // Laitesivu: suoraan sisältö, koko leveys.
        <Outlet />
      ) : isCoverPage ? (
        // Kansisivu: joustava pystyasettelu.
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <Outlet />
        </main>
      ) : (
        // Tavallinen sivu: vakiosisältökehys.
        <main className="main-content">
          <Outlet />
        </main>
      )}

      {/* Alatunniste näytetään kaikilla paitsi laitesivuilla. */}
      {!isDevicePage && (
        <footer className="app-footer">
          <p>
            Medical physics expert services,{' '}
            <a href="https://github.com/Skullervo" target="_blank" rel="noopener noreferrer">
              @skullervo
            </a>.
          </p>
        </footer>
      )}
    </div>
  )
}
