import { Link, Outlet, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Menu } from 'lucide-react'

const navItems = [
  { path: '/', label: 'Aloitus', exact: true },
  { path: '/modaliteetit', label: 'Modaliteetit', match: ['/modaliteetit', '/us', '/xray', '/ct'] },
  { path: '/laitteet', label: 'Laitteet', match: ['/laitteet'] },
  { path: '/tietoa', label: 'Tietoa', exact: true },
]

function getTheme(): 'dark' | 'light' {
  return (localStorage.getItem('autoqad-theme') as 'dark' | 'light') || 'dark'
}

const ctrlBtn: React.CSSProperties = {
  width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)',
  color: 'var(--text-muted)', cursor: 'pointer', fontSize: 15, lineHeight: 1,
}

export default function Layout() {
  const location = useLocation()
  const [theme, setTheme] = useState<'dark' | 'light'>(getTheme)
  const [menuOpen, setMenuOpen] = useState(false)
  const isDevicePage = /\/(us\/device|xray\/device|ct\/device)\//.test(location.pathname)
  const isCoverPage = location.pathname === '/' || location.pathname === '/tietoa'

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('autoqad-theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  const isActive = (item: typeof navItems[number]) => {
    if (item.exact) return location.pathname === item.path
    if (item.match) return item.match.some(p => location.pathname.startsWith(p))
    return location.pathname.startsWith(item.path)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Oikea yläkulma: navigaatio-pudotusvalikko + teema (ei enää yläpaneelia) */}
      <div style={{ position: 'fixed', top: 6, right: 14, zIndex: 2000, display: 'flex', gap: 6, alignItems: 'center' }}>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setMenuOpen(o => !o)} aria-label="Navigointivalikko" aria-expanded={menuOpen} style={ctrlBtn}>
            <Menu size={18} aria-hidden />
          </button>
          {menuOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 180,
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
              padding: 4, boxShadow: '0 8px 24px rgba(0,0,0,.4)', display: 'flex', flexDirection: 'column', gap: 2,
            }}>
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
        <button onClick={toggleTheme} aria-label="Vaihda teema" style={ctrlBtn}>
          {theme === 'dark' ? '☀' : '🌙'}
        </button>
      </div>

      {/* Klikkaus valikon ulkopuolelle sulkee sen */}
      {menuOpen && (
        <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 1999 }} />
      )}

      {isDevicePage ? (
        <Outlet />
      ) : isCoverPage ? (
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <Outlet />
        </main>
      ) : (
        <main className="main-content">
          <Outlet />
        </main>
      )}

      {!isDevicePage && (
        <footer className="app-footer">
          <p>
            Lääketieteellisen fysiikan asiantuntijapalvelut,{' '}
            <a href="https://github.com/Skullervo" target="_blank" rel="noopener noreferrer">
              @skullervo
            </a>.
          </p>
        </footer>
      )}
    </div>
  )
}
