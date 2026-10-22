// =============================================================================
// main.tsx — Koko React-sovelluksen käynnistyspiste (entry point)
// =============================================================================
// Tämä tiedosto on se, jonka Vite lataa ensimmäisenä selaimessa (viitattu
// index.html:ssä). Se tekee kaksi asiaa:
//   1) Luo TanStack Query -asiakkaan (välimuisti kaikille Go-backendiltä
//      haettaville tiedoille).
//   2) Kiinnittää <App />-komponentin index.html:n <div id="root"> -elementtiin
//      eli renderöi koko sovelluksen ruudulle.
// Jos haluat muuttaa esim. datan välimuistin kestoa tai uudelleenyritysten
// määrää, se tehdään tässä queryClient-asetuksissa.
// =============================================================================

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'

// TanStack Query -asiakas hallinnoi palvelimelta haettujen tietojen välimuistia.
// Sama asiakas jaetaan koko sovellukselle (ks. QueryClientProvider alempana).
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Haettu data pysyy "tuoreena" 5 minuuttia (5 * 60 * 1000 ms), jolloin
      // samaa dataa ei haeta turhaan uudelleen esim. sivua vaihtaessa.
      staleTime: 5 * 60 * 1000,
      // Jos haku epäonnistuu, yritetään vielä kerran ennen virheen näyttämistä.
      retry: 1,
    },
  },
})

// Etsitään index.html:n juurielementti ja renderöidään koko sovellus sen sisään.
// Huutomerkki (!) kertoo TypeScriptille, että elementti on varmasti olemassa.
createRoot(document.getElementById('root')!).render(
  // StrictMode = Reactin kehitysaikainen tarkistustila (auttaa löytämään bugeja).
  <StrictMode>
    {/* QueryClientProvider tarjoaa yllä luodun välimuistin kaikille komponenteille. */}
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
