package middleware

import "net/http"

// RequireAuth is a placeholder for authentication middleware.
// TODO: Implement JWT or session-based auth.
func RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Pass through for now — auth will be added in Phase 3 Step 2
		next.ServeHTTP(w, r)
	})
}
