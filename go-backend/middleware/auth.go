// middleware/auth.go: autentikoinnin väliohjelmisto (middleware).
//
// HUOM: Tämä on vielä PAIKANVARAAJA. Se kiinnitetään /api-reittiryhmään (main.go),
// mutta tällä hetkellä se päästää kaikki pyynnöt läpi tekemättä tarkistuksia.
// Oikea autentikointi (JWT tai istuntopohjainen, Djangon @login_required -vastine)
// lisätään tähän myöhemmin. Kun tarkistus toteutetaan, luvattomat pyynnöt tulee
// hylätä tässä ENNEN next.ServeHTTP-kutsua (esim. 401 Unauthorized).
package middleware

import "net/http"

// RequireAuth käärii seuraavan handlerin (next). Tällä hetkellä se vain välittää
// pyynnön eteenpäin sellaisenaan.
func RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Läpivienti toistaiseksi — autentikointi lisätään Phase 3:n vaiheessa 2.
		next.ServeHTTP(w, r)
	})
}
