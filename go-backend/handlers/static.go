// handlers/static.go: React-käyttöliittymän (SPA) tarjoilu staattisina tiedostoina.
//
// Kaikki reitit jotka eivät ole /api-rajapintoja päätyvät tänne. Tämä on klassinen
// SPA-tarjoilu: jos pyydetty tiedosto (esim. /assets/app.js) löytyy levyltä, se
// palautetaan; muuten palautetaan index.html, jolloin selainpuolen reititin
// (React Router) hoitaa näkymän. Kehityksessä frontend ajetaan Vitellä (portti 5174),
// jolloin tätä ei käytetä; tuotannossa React-buildin dist/-kansio on binäärin vieressä.
package handlers

import (
	"net/http"
	"os"
	"path/filepath"
)

// ServeReact tarjoilee React-sovelluksen. Kansio tulee REACT_DIST-muuttujasta
// (oletus ./frontend/dist).
func ServeReact(w http.ResponseWriter, r *http.Request) {
	distDir := os.Getenv("REACT_DIST")
	if distDir == "" {
		distDir = "./frontend/dist"
	}

	// Yritetään tarjoilla pyydetty tiedosto suoraan. filepath.Clean estää polun
	// kiipeämisen hakemistosta ulos (esim. ../../etc). Jos löytyy ja on tiedosto
	// (ei hakemisto), palautetaan se sellaisenaan.
	requestedPath := filepath.Join(distDir, filepath.Clean(r.URL.Path))
	if info, err := os.Stat(requestedPath); err == nil && !info.IsDir() {
		http.ServeFile(w, r, requestedPath)
		return
	}

	// Muuten palautetaan index.html — selainpuolen reititys hoitaa varsinaisen sivun.
	http.ServeFile(w, r, filepath.Join(distDir, "index.html"))
}
