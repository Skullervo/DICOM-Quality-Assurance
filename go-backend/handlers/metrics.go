package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
	httpRequests = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "autoqad_http_requests_total",
		Help: "HTTP-pyyntöjen kokonaismäärä (metodi, reitti, status).",
	}, []string{"method", "route", "status"})

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
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		start := time.Now()
		next.ServeHTTP(ww, r)

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
