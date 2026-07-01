import { Link, Outlet, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'

const navItems = [
  { path: '/', label: 'Aloitus', exact: true },
  { path: '/modaliteetit', label: 'Modaliteetit', match: ['/modaliteetit', '/us', '/xray', '/ct'] },
  { path: '/tietoa', label: 'Tietoa', exact: true },
]

function getTheme(): 'dark' | 'light' {
  return (localStorage.getItem('autoqad-theme') as 'dark' | 'light') || 'dark'
}

export default function Layout() {
  const location = useLocation()
  const [theme, setTheme] = useState<'dark' | 'light'>(getTheme)
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
      <header>
        <nav className="navbar">
          <h3 className="navbar-brand">
            <Link to="/">LV-automaatti</Link>
          </h3>
          <div className="nav-links">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-link ${isActive(item) ? 'active' : ''}`}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="nav-controls">
            <button className="theme-btn" onClick={toggleTheme} aria-label="Toggle theme">
              {theme === 'dark' ? '\u2600' : '\uD83C\uDF19'}
            </button>
          </div>
        </nav>
      </header>

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
