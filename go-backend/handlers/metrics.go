// handlers/metrics.go: Prometheus-mittarit ja /metrics-reitti.
//
// Osa monitorointipinoa (Prometheus + Grafana). Tässä määritellään kaksi mittaria —
// pyyntöjen kokonaismäärä ja pyynnön kesto — sekä middleware joka kirjaa ne jokaisesta
// HTTP-pyynnöstä. Prometheus hakee arvot /metrics-reitiltä (ks. main.go).
package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto" // rekisteröi mittarit automaattisesti
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Globaalit mittarit. promauto rekisteröi ne oletusrekisteriin, jonka /metrics paljastaa.
var (
	// Laskuri: kuinka monta pyyntöä, eriteltynä metodin, reitin ja HTTP-statuksen mukaan.
	httpRequests = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "autoqad_http_requests_total",
		Help: "HTTP-pyyntöjen kokonaismäärä (metodi, reitti, status).",
	}, []string{"method", "route", "status"})

	// Histogrammi: pyyntöjen kestojakauma sekunteina (latenssin seuranta).
	httpDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "autoqad_http_request_duration_seconds",
		Help:    "HTTP-pyynnön kesto sekunteina.",
		Buckets: prometheus.DefBuckets,
	}, []string{"method", "route"})
)

// MetricsMiddleware kirjaa pyyntömäärät + keston Prometheus-metriikoiksi.
// Reitti otetaan chi:n templatesta (esim. /us/device/{station}) matalan
// kardinaliteetin säilyttämiseksi.
func MetricsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// WrapResponseWriter napataan talteen vastauksen HTTP-status (ww.Status()).
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		start := time.Now()
		next.ServeHTTP(ww, r) // suoritetaan varsinainen handler

		// Käytetään reittimallia (esim. /us/device/{station}) EIKÄ konkreettista polkua,
		// jotta mittareihin ei synny loputtomasti eri arvoja (matala kardinaliteetti).
		route := chi.RouteContext(r.Context()).RoutePattern()
		if route == "" {
			route = "unknown"
		}
		httpRequests.WithLabelValues(r.Method, route, strconv.Itoa(ww.Status())).Inc()
		httpDuration.WithLabelValues(r.Method, route).Observe(time.Since(start).Seconds())
	})
}

// MetricsHandler palauttaa Prometheus /metrics -käsittelijän.
func MetricsHandler() http.Handler {
	return promhttp.Handler()
}
