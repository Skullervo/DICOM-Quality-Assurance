// =============================================================================
// components/Breadcrumb.tsx — Murupolku (navigointipolku sivun yläreunassa)
// =============================================================================
// Näyttää käyttäjälle missä kohtaa sivuhierarkiaa ollaan (esim.
// "Laitokset / OYS / CT-laite"). Tiedostossa on kaksi versiota:
//   - Breadcrumb     : käyttää kovaa sivunvaihtoa (window.location) — laitesivuilla,
//                      jotka eivät elä React-Routerin sisällä samalla tavalla.
//     HUOM: linkit renderöidään <a>-tageina, joissa klikkaus estetään ja hoidetaan
//     käsin window.location.href:llä, jotta tyyli pysyy samana.
//   - BreadcrumbNav  : käyttää React-Routerin <Link>iä (ei koko sivun uudelleenlatausta).
// =============================================================================

import { Link } from 'react-router-dom'

// Yksi murupolun osa: näkyvä teksti + valinnainen linkkipolku.
// Jos path puuttuu, osa on nykyinen sivu (ei klikattava).
interface BreadcrumbItem {
  label: string
  path?: string
}

// Murupolku kovalla sivunvaihdolla (laitesivut).
export default function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="breadcrumb" style={{ marginTop: 0 }}>
      {items.map((item, i) => (
        <span key={i}>
          {/* Erotin "/" näytetään kaikkien paitsi ensimmäisen osan edessä. */}
          {i > 0 && <span className="separator">/</span>}
          {item.path ? (
            // Estetään selaimen oletuslinkki ja ohjataan kovalla sivunvaihdolla.
            <a href={item.path} onClick={(e) => { e.preventDefault(); window.location.href = item.path! }}>
              {item.label}
            </a>
          ) : (
            // Nykyinen sivu: pelkkä teksti, ei linkkiä.
            <span className="current">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

// Murupolku React-Routerin sisäisellä navigoinnilla (<Link>).
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
