import { Link } from 'react-router-dom'

interface BreadcrumbItem {
  label: string
  path?: string
}

export default function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="breadcrumb" style={{ marginTop: 0 }}>
      {items.map((item, i) => (
        <span key={i}>
          {i > 0 && <span className="separator">/</span>}
          {item.path ? (
            <a href={item.path} onClick={(e) => { e.preventDefault(); window.location.href = item.path! }}>
              {item.label}
            </a>
          ) : (
            <span className="current">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

export function BreadcrumbNav({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="breadcrumb" style={{ marginTop: 0 }}>
      {items.map((item, i) => (
        <span key={i}>
          {i > 0 && <span className="separator"> / </span>}
          {item.path ? (
            <Link to={item.path}>{item.label}</Link>
          ) : (
            <span className="current">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
