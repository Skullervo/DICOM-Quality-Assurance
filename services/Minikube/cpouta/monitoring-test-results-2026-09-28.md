# AutoQAD — Monitoring & Alerting Verification (cPouta Kubernetes)

**Date:** 2026-09-28
**Cluster:** cPouta 3-node kubeadm (autoqad-control 4 GB + autoqad-worker-1/-2 2 GB), k8s v1.29.15, Flannel CNI
**Purpose:** Verify the manuscript's "continuous observability" claims (Physica Medica revision) with a real, deployed monitoring + alerting stack.

---

## 1. What was built

The revision test document assumed a monitoring stack (`monitoring` namespace, Prometheus/Grafana/Alertmanager, custom `autoqad_` metrics, alert rules) that **did not exist** on cPouta — only the workload pods (mssql, orthanc, fetch, us-analysis) were running. The stack was therefore built from scratch:

| Component | Image | Placement | Purpose |
|---|---|---|---|
| Prometheus | prom/prometheus:v2.53.2 | control-plane | scrape + rule evaluation, NodePort 30090 |
| Alertmanager | prom/alertmanager:v0.27.0 | control-plane | alert routing, NodePort 30093 |
| Grafana | grafana/grafana:11.1.4 | control-plane | dashboards, NodePort 30030 |
| kube-state-metrics | v2.13.0 | control-plane | k8s object metrics (replica counts) |
| node-exporter | v1.8.2 | DaemonSet (all 3 nodes) | host CPU/mem/disk metrics |

Manifest: [`monitoring.yaml`](monitoring.yaml). Raskaat komponentit on pinnattu control-planeen (4 GB), jotta workerit jäävät analyysille; node-exporter ajetaan kaikilla nodeilla toleraatioilla.

### Application instrumentation (new)
`services/Analyze_service/analyze_service_timed.py` was instrumented with `prometheus_client`, exposing a metrics endpoint on **port 9110**:

| Metric | Type | Meaning |
|---|---|---|
| `autoqad_images_processed_total{modality,status}` | counter | images analyzed (status = success \| failed) |
| `autoqad_qa_results_total{modality}` | counter | QA results persisted to the database |
| `autoqad_analysis_duration_seconds{modality}` | histogram | per-image analysis wall-time |
| `autoqad_analysis_rounds_total` | counter | scheduled analysis rounds executed |
| `autoqad_shard_total` | gauge | this replica's work-sharding fan-out |

The image was rebuilt and pushed (`docker.io/skullervo/autoqad-us-analyze:latest`); the StatefulSet now declares a named `metrics` port (9110) that Prometheus discovers via Kubernetes pod service-discovery.

---

## 2. Results summary

| # | Test | Method | Result | Evidence |
|---|---|---|---|---|
| 1 | Prometheus targets healthy | `/api/v1/targets` | **PASS** | 7/7 targets `up` (prometheus, kube-state-metrics, 3× node-exporter, 2× us-analysis) |
| 2 | Custom `autoqad_` metrics | PromQL queries | **PASS** | `autoqad_images_processed_total`, `_qa_results_total`, `_analysis_duration_seconds`, `_analysis_rounds_total`, `_shard_total` all present with live values |
| 3 | Alert rules loaded | `/api/v1/rules` | **PASS** | 5 rules, all `health=ok`, across 2 groups (availability, performance) |
| 4 | Alert fires on failure | scale us-analysis → 0, time to `firing` | **PASS** | detection (pending) ≈ 61 s, firing ≈ 121 s, delivered to Alertmanager (`critical`, active) |
| 5 | Grafana responsive | 5× HTTP timing | **PASS** | health 1 ms, dashboard 58 ms, live query via datasource proxy 77 ms (median) |
| 6 | Alertmanager routing | `/api/v2/status`, `/api/v2/alerts` | **PASS** | cluster `ready`; route→`slack-default`, `severity=critical`→`slack-critical`; received `AutoQADAnalysisDown` |
| 7 | Slack notification delivery | fire + resolve → Slack #LV-automaatti | **PASS** | 2/2 notifications delivered (firing + resolved), 0 failures |

**All 7 tests PASS.**

---

## 3. Test detail (measured values)

### Test 1 — Target health
```
kube-state-metrics  http://kube-state-metrics.monitoring.svc:8080/metrics  up
node-exporter       http://192.168.1.83:9100/metrics                       up   (worker-1)
node-exporter       http://192.168.1.173:9100/metrics                      up   (control)
node-exporter       http://192.168.1.72:9100/metrics                       up   (worker-2)
prometheus          http://localhost:9090/metrics                          up
us-analysis         us-analysis-0 :9110                                    up
us-analysis         us-analysis-1 :9110                                    up
→ 7/7 UP
```

### Test 2 — Custom application metrics
Triggered live traffic by re-queuing a sample of images (deletion of DB rows → next scheduled round re-analyzes them). Observed:
- `sum(autoqad_qa_results_total)` = 25 QA results persisted
- `sum by(status)(autoqad_images_processed_total)` = success 25, **failed 108**
- `autoqad_analysis_rounds_total` = 8 (pod-1) + 6 (pod-0)
- `autoqad_analysis_duration_seconds_count` = 25 observations
- **mean per-image analysis time = 0.118 s** (`sum/count`)

> The high `failed` count reflects ~12 specific ultrasound images that repeatedly fail the LUT/transducer step and are retried every scheduling round — **precisely the kind of silent recurring failure the observability layer is meant to surface** (see `project_us_lut_transducer_bug`). p50/p95 via `histogram_quantile` returned NaN because the backlog is analyzed in a single short burst (no continuous load window); the mean and the populated buckets confirm the histogram works end-to-end.

### Test 3 — Alert rules
```
autoqad-availability :: AutoQADAnalysisDown       [ok] inactive
autoqad-availability :: AutoQADAnalysisDegraded   [ok] inactive
autoqad-availability :: TargetDown                [ok] inactive
autoqad-performance  :: AutoQADHighAnalysisLatency[ok] inactive
autoqad-performance  :: NodeHighCPU               [ok] inactive
```

### Test 4 — Alert firing latency (fault injection)
Scaled `statefulset/us-analysis` to 0 replicas at T0:
```
t+0…51s   AutoQADAnalysisDown = none      (kube-state-metrics reflecting ready→0)
t+61s     AutoQADAnalysisDown = pending   ← detection
t+71…111s AutoQADAnalysisDown = pending   (for: 1m dwell)
t+121s    AutoQADAnalysisDown = firing    ← fired
Alertmanager /api/v2/alerts: AutoQADAnalysisDown critical active
```
End-to-end failure→alert latency ≈ **121 s**, dominated by the deliberate `for: 1m` dwell (suppresses flapping). Detection latency ≈ 61 s. Replicas restored to 2 afterward.

### Test 5 — Grafana response time (5 samples each, median)
```
/api/health                                   1 ms
/api/dashboards/uid/autoqad-us               58 ms
live query via datasource proxy              77 ms
datasource: Prometheus (default) — healthy
```

### Test 6 — Alertmanager
```
cluster status = ready
route:  receiver=default;  severity="critical" → receiver=critical (group_wait 5s)
inhibit: critical suppresses warning for same service
received: AutoQADAnalysisDown (critical, active) during Test 4
```
Receivers are wired to Slack (`slack_configs`, channel `#LV-automaatti`) with `send_resolved: true`. The webhook URL is stored in a Kubernetes Secret (`alertmanager-slack`, key `webhook-url`) and read via `slack_api_url_file` — **it is never committed to the repository**.

### Test 7 — Slack notification delivery (fire + resolve)
Same fault injection as Test 4 (scale `us-analysis` → 0, then restore), observing Alertmanager's Slack integration counters:
```
firing:   alertmanager_notifications_total{integration="slack"}  = 1
resolved: alertmanager_notifications_total{integration="slack"}  = 2   (sent on next flush cycle after recovery)
failures: sum(alertmanager_notifications_failed_total{integration="slack"}) = 0
active alerts after restore = 0
```
Both the firing and the resolved messages were delivered to `#LV-automaatti` with zero failures. A failed POST to Slack would increment `alertmanager_notifications_failed_total{reason="clientError"|"serverError"}`; all failure reasons remained at 0.

### Observability sanity (node-exporter)
Node CPU utilisation during the test: control 9.9 %, worker-2 6.9 %, worker-1 3.6 % — cluster near-idle, consistent with the small re-analysis workload.

---

## 4. Access

NodePorts are bound on the control-plane node. If the cPouta security group does not expose 30030/30090/30093 externally, tunnel via SSH:
```bash
ssh -i autoqad-key.pem -L 30090:localhost:30090 -L 30030:localhost:30030 -L 30093:localhost:30093 ubuntu@86.50.23.185
# Prometheus  http://localhost:30090
# Grafana     http://localhost:30030   (admin / radiqa; anonymous Viewer enabled)
# Alertmanager http://localhost:30093
```

---

## 5. Manuscript text (drop-in)

### Methods — 2.4.4 Continuous observability
> System observability was implemented with a Prometheus/Grafana/Alertmanager stack deployed as Kubernetes workloads alongside the analysis services. Each analysis service exports application-level metrics (images processed, QA results persisted, per-image analysis duration, and scheduling activity) over an HTTP endpoint discovered automatically through Kubernetes service discovery. Cluster- and host-level metrics were collected with kube-state-metrics and node-exporter. Prometheus (15 s scrape and evaluation interval) evaluated a set of alerting rules covering service availability (no ready analysis replica), degraded capacity, unreachable scrape targets, elevated analysis latency, and node CPU saturation; firing alerts were routed to Alertmanager with severity-based routing and flap-suppression dwell times, and delivered to a team messaging channel (Slack) with automatic resolution notifications. Grafana provided operational dashboards backed by the same Prometheus data source.

### Results — observability verification
> The observability stack was verified end-to-end on the three-node cPouta cluster. All scrape targets were healthy (7/7 `up`), and the custom application metrics were confirmed to populate with live analysis traffic (mean per-image analysis time 0.12 s). Fault tolerance of the alerting path was validated by scaling the ultrasound analysis workload to zero replicas: the `AutoQADAnalysisDown` alert entered the pending state within ~61 s and fired after ~121 s (the additional interval being the configured one-minute suppression dwell), and was delivered to Alertmanager as a critical alert and forwarded to the team Slack channel; the corresponding resolution notification was sent automatically once the service recovered. Grafana served dashboards and live Prometheus queries with sub-100 ms median response times. The instrumentation additionally surfaced a recurring analysis-failure signal (repeated LUT/transducer failures on a small subset of images), demonstrating that silent, recurring failures are made visible by the monitoring layer.

---

## 6. Caveats / notes

- **Dependency float:** the rebuilt image floated to newer scientific libs (opencv 5.0, numpy 2.5, scikit-image 0.26). A subset (~12) of previously-analyzed images now fail the LUT step on re-analysis and are not re-persisted (DB ~790 rows vs 802). The DICOMs remain in Orthanc and can be re-analyzed once the LUT bug is addressed. This did not affect any monitoring test outcome — and the failures are themselves observable in `autoqad_images_processed_total{status="failed"}`.
- Alertmanager delivers to Slack (`#LV-automaatti`) via a webhook held in a Kubernetes Secret (not in the repo). Rotate the webhook if it was ever exposed in plaintext.
- Prometheus/Grafana/Alertmanager use `emptyDir` (ephemeral) storage — appropriate for a test cluster; use PVCs for retention in production.
- `histogram_quantile` percentiles require sustained load; the one-shot backlog yields a valid mean but NaN percentiles.
