// handlers/health.go: terveystarkistus-reitti (GET /health).
//
// Kubernetes käyttää tätä liveness/readiness-tarkistukseen: jos vastaus ei tule tai
// ei ole 200 OK, orkestraattori voi käynnistää kontin uudelleen. Reitti on auth-vapaa.
package handlers

import (
	"encoding/json"
	"net/http"
)

// Health palauttaa kiinteän JSON-vastauksen {"status":"ok","service":"autoqad-backend"}.
// Ei koske tietokantaan — kertoo vain että HTTP-palvelin on pystyssä ja vastaa.
func Health(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"service": "autoqad-backend",
	})
}
