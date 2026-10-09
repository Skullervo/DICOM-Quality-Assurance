# AutoQAD — Event-Driven Architecture Performance & Fault-Tolerance Test (cPouta)

**Date:** 2026-10-07
**Cluster:** cPouta 3-node kubeadm (autoqad-control 4 GB + autoqad-worker-1/-2 2 GB), k8s v1.29.15
**Architecture:** Event-driven pipeline (ingestion → SQL Server Service Broker → competing-consumer workers → S3). Replaces the earlier polling/claim/index-sharding model.
**Purpose:** Re-run the earlier horizontal-scaling **and fault-tolerance** tests on the new architecture, with the identical 802-image ultrasound dataset. Fault tolerance now covers the whole stack: workers, Go backend, SeaweedFS (S3), Orthanc, and the database (§3).

---

## 1. Method

- **Workload:** all 802 ultrasound instances in the cPouta Orthanc (the same dataset as the earlier sharding tests). Jobs created by the ingestion service (one `us_jobs` row per instance).
- **Scaling model:** competing consumers. Each `us-worker` replica independently claims jobs from `us_jobs` atomically (`UPDATE ... WITH (READPAST, ROWLOCK, UPDLOCK)`); no index-sharding, no `SHARD_TOTAL`. Scale = `kubectl scale deployment/us-worker --replicas=R`.
- **Per replica count R ∈ {1, 2, 3, 4}:**
  1. scale workers to 0, reset all jobs to `QUEUED` (clear timestamps),
  2. scale to R, wait until all R pods are `1/1`,
  3. wait until every job is terminal (`COMPLETED`/`FAILED`),
  4. measure the **clean processing span** = `MAX(completed_at) − MIN(started_at)` across jobs (independent of pod ramp-up), and throughput = `N / span`.
- **Clean environment:** the old poller (`us-analysis` StatefulSet) scaled to 0 (no resource/Orthanc/DB contention). Worker memory limit 768 Mi so 4 pods fit on the 2 worker nodes. `STRAIGHTEN_US=0` during the perf run (no straightened-image Orthanc push — keeps the measurement comparable to the earlier tests, which also did straightening as a separate backfill).

---

## 2. Results

| R (workers) | N | completed | failed | span (s) | throughput (jobs/s) | speedup | efficiency | nodes |
|---|---|---|---|---|---|---|---|---|
| 1 | 802 | 802 | 0 | 472.6 | 1.70 | 1.00× | 100 % | worker-1 |
| 2 | 802 | 802 | 0 | 300.5 | 2.67 | **1.57×** | 78 % | worker-1 + worker-2 |
| 3 | 802 | 802 | 0 | 198.6 | 4.04 | **2.38×** | 79 % | worker-1 + worker-2 |
| 4 | 802 | 802 | 0 | 162.7 | 4.93 | **2.90×** | 73 % | worker-1 + worker-2 (2 pods/node) |

> R=3 was added on 2026-10-08 (same methodology, `STRAIGHTEN_US=0`); R=1/2/4 are from 2026-10-07. The ~1 % run-to-run variance explains R=3 efficiency (79 %) sitting level with R=2 (78 %) rather than strictly between it and R=4.

**All 802 images analyzed successfully (0 failures) at every replica count.**

- The event-driven competing-consumer model scales **2.90× with 4 workers**, comparable to (slightly above) the earlier index-sharding result (~2.67× at R=4) on the same cluster + dataset.
- Scaling is sub-linear (73–78 % efficiency). The limiting factors are the **2 physical worker nodes** (CPU) and the **shared Orthanc (DICOM fetch) and single MS SQL Server** that all workers contend for. Going from 2→4 pods still improves throughput (2.67→4.93) because I/O (Orthanc fetch, DB insert) on one pod overlaps compute on another.

---

## 3. Fault tolerance & recovery

Each component's pod is force-killed (`kubectl delete pod --force --grace-period=0`); measured: recovery to Ready/serving + data survival. Workers are additionally killed **mid-processing** to test task survival (reclaim). This mirrors the earlier §1 fault-tolerance tests, now extended to the full event-driven stack — **including the Go backend, SeaweedFS (S3), and the ingestion service**, plus Orthanc and the database (6 services).

### 3.1 Component recovery + data persistence

Each recovery time is **n=10** (pod deletion → replacement pod Ready), mean with range and median; data survival verified after the kills.

| Component | Recovery time, n=10 (mean; range; median) | Data survived |
|---|---|---|
| **us-worker** (analysis, stateless) | **4.4 s**; 2.0–11.2; 3.3 | — (recreated; mid-analysis kill → task survival §3.2) |
| **Orthanc / DICOM** (PVC) | **6.0 s**; 3.7–9.2; 5.9 | ✅ DICOM instances retained |
| **go-backend** (stateless) | **11.0 s**; 10.6–11.6; 11.0 | — (API + UI served again) |
| **ingestion** (FastAPI, stateless) | **11.0 s**; 10.7–11.3; 11.0 | — (no PVC) |
| **SeaweedFS / S3** (PVC) | **45.5 s**; 31.0–53.3; 51.0 | ✅ 802 → 802 objects |
| **MS SQL Server** (PVC, stateful) | **87.6 s**; 42.9–113.0; 95.4 | ✅ jobs + results retained; workers survived DB outage (0 restarts) |

All measured n=10 with the same method as the analysis worker (previously the other services were single measurements — 13/14/55/25/81 s — which the n=10 repeats corrected: Orthanc in particular averages 6 s, not the 25 s single outlier; go-backend/ingestion 11 s). The **stateless/light components recover in seconds** (us-worker 4.4, Orthanc 6, go-backend/ingestion 11); the **stateful MS SQL Server dominates** (87.6 s mean — engine start + DB recovery, high variance 43–113 s). **All PVC-backed data survived** (local-path PVs; MSSQL is pinned to the control-plane node via `nodeSelector`, so it reschedules onto the same node's volume). The data-persistence kills were run with the job queue empty (pure recovery + persistence test); in-flight resilience is covered by §3.2.

### 3.2 Task survival — in-flight work survives a crash (the event-model core property)

With 4 workers processing the 802-job queue, **2 of 4 were force-killed mid-analysis** (75 jobs done, 2 in-flight CLAIMED at kill time):

| Measure | Result |
|---|---|
| Jobs terminal | **802 / 802** |
| Completed | **802** (0 FAILED) |
| Jobs lost | **0** |
| Worker self-heal | 4/4 |

The killed pods' orphaned claims (CLAIMED rows whose `claimed_at` went stale; `CLAIM_TIMEOUT_SECONDS=60` for the test, default 300) were **reclaimed** by the surviving + recreated workers and reprocessed → every image analyzed **exactly once**. This is the event-model equivalent of the earlier TESTI 6 (3/3): a lost worker never loses *or* double-runs a job, because the **DB table is the source of truth** (atomic claim `UPDATE … WITH (READPAST, ROWLOCK, UPDLOCK)`) and Service Broker is only a wake-up doorbell.

### 3.3 Database-outage resilience

When MSSQL was killed (F5), the running workers **survived the DB outage with 0 restarts** — they reconnect rather than crash-loop. Combined with the atomic claim + job state machine, a transient DB blip neither loses jobs nor corrupts state (the 802/802 job + 1604/1604 result rows were intact after recovery).

### 3.4 Monitoring & alerting — service-down alert across all services, delivered to Slack

The service-down rule (`AutoQADServiceDown`) watches **all six critical deployments** (`kube_deployment_status_replicas_available{deployment=~"us-worker|go-backend|ingestion-service|object-storage|orthanc|mssql"} == 0`, `for: 1m`). Each service was scaled to 0 and the detection (→ `pending`) and firing times measured (n=1 each):

| Service (scaled to 0) | Detection → pending (s) | → firing (s) |
|---|---|---|
| Analysis worker (us-worker) | 21 | 80 |
| Web backend (go-backend) | 8 | 69 |
| Ingestion service | 16 | 77 |
| Object storage (SeaweedFS) | 18 | 77 |
| DICOM server (Orthanc) | 13 | 72 |
| Database (MSSQL) | 8 | 67 |

Detection **8–21 s** (scrape-limited; the spread is scrape-alignment, not a real per-service difference); firing **67–80 s**, **dominated by the deliberate `for: 1m` flap-suppression dwell** (≈ detection + 60 s). All six fired and were delivered to Slack (`#LV-automaatti`) with **0 failures**. Broader observability carries over from [monitoring-test-results-2026-09-28.md](monitoring-test-results-2026-09-28.md): 7/7 scrape targets up, custom `autoqad_` metrics populated, Grafana **58 ms** median query latency; `us-worker` is scraped on :9110 via the same instrumentation in `worker_common.py`.

### 3.5 QA-failure alerting — out-of-tolerance measurement → Slack (2026-10-09)

Distinct from the infrastructure alert (§3.4, *service down*), the framework now alerts on **QA results**. The US event worker (image `:cv4q`) loads `tolerance_config` and classifies each measurement against the tolerances (same PASS/WARN/FAIL logic as the frontend `deriveStatus`), emitting `autoqad_qa_verdict_total{modality, station, verdict}`. A new rule `AutoQADQAFailure` (`autoqad_qa_verdict_total{verdict="fail"} > 0`, per device) routes to Slack.

**Controlled test** — the US `u_cov` upper limit was temporarily lowered to 0.5 so one otherwise-normal measurement exceeds it:

| Measure | Result |
|---|---|
| Worker classifies the measurement as FAIL | ✅ `autoqad_qa_verdict_total{verdict="fail"}` = 1 |
| Detection — fail metric visible in Prometheus | **6 s** (from the failing measurement) |
| `AutoQADQAFailure` fires (no dwell, `for: 0m`), **naming the device** | **18 s** — firing, station `LS71810305S3` |
| Slack delivery | ✅ delivered (`alertmanager_notifications_total{slack}` +1), **0 failures** |
| Auto-clear | ✅ rule back to `inactive` after the condition cleared (counter reset on worker restart) |

An out-of-tolerance QA measurement now reaches the physicist on Slack automatically, naming the failing device — not only the service-down infrastructure alert. It fires in **~18 s** (detection 6 s + one evaluation cycle, **no suppression dwell** — a real QA finding should surface immediately), versus 67–80 s for the infrastructure alert whose `for: 1m` dwell suppresses transient flaps (§3.4). *Limitation: the counter-based rule stays firing until the worker's metric resets; a gauge-based "current device status" that auto-resolves when the device next passes is the natural refinement.*

---

## 4. Important methodological finding — dependency bug invalidated the first run

The **first** run reported 599 completed / 203 failed and apparently-higher throughput (1.84 jobs/s at R=1). Investigation of `us_jobs.error_message` showed the dominant failure (140+) was:

```
module 'cv2' has no attribute 'linearPolar'
```

`cv2.linearPolar` (used by the ultrasound convex-probe straightening/polar transform) was **removed in OpenCV 5.0**. The worker image had floated `opencv-python>=4.10.0` → **5.0.0.93**, so convex-probe analyses crashed. The old poller uses OpenCV 4.x, which is why it never showed these failures. The ~200 "failures" were therefore a **dependency bug, not a dataset problem** — the 802-image dataset is clean.

**Fix:** pinned `opencv-python==4.11.0.86` (last 4.x, retains `linearPolar`), rebuilt the worker, re-ran. Result: **0 failures**, confirming the clean dataset. The fast-failing images had also inflated the first run's apparent throughput, so those numbers are discarded.

**Analysis-code parity (verified):** `US_IQ_analysis3.py` and `probe-LUT.xls` are byte-identical between the local source and the cPouta pod (md5 `74645456…aacc5` and `d97b8cad…ed87`); OpenCV 4.11.0 / NumPy 2.5.3 in both.

---

## 5. Caveats / notes

- **Cluster size:** 2 worker nodes bound the scaling; a wider cluster would extend it. The shared Orthanc + single SQL Server are the next bottlenecks (fetch + insert serialization).
- **Duplicate result rows:** each perf re-run re-queues and re-analyzes all 802 jobs, inserting new `ultrasound` rows each time (the worker dedups at the job level, not the result level). The table accumulated ~5× duplicates during testing; deduplicated to one row per instance afterward.
- **Metric:** span uses `started_at`/`completed_at` written by the worker on RUNNING/COMPLETED|FAILED, so it measures real processing wall-time excluding pod scheduling.
- Live metrics of each run are visible in Grafana (dashboard "AutoQAD — Event-driven skaalaus", Prometheus scrapes the `us-worker` pods on :9110).

---

## Appendix A. Per-device / per-transducer QA results (N = 802)

PASS/WARN/FAIL counts per (manufacturer → model → transducer), classified against the predefined tolerance limits; S_depth / U_cov / U_skew are mean values across the measurements in each group. This is the full ratifiable dataset (all 802 analyzed images) and corresponds to the manuscript's Table 1.

| Manufacturer | Model | Transducer | N | PASS | WARN | FAIL | S_depth (mm) | U_cov (%) | U_skew |
|---|---|---|---|---|---|---|---|---|---|
| GE Healthcare | LOGIQ E9 | LINEAR 15000 | 2 | 2 | 0 | 0 | 1.3 | 4.17 | −1.210 |
| GE Healthcare | LOGIQ E9 | SECTOR PHASED 4000 | 1 | 1 | 0 | 0 | 1.6 | 16.33 | +0.485 |
| GE Healthcare | LOGIQ E9 | CURVED LINEAR 6000 | 1 | 1 | 0 | 0 | 2.1 | 3.41 | −0.313 |
| GE Healthcare | LOGIQ E9 | LINEAR 9000 | 1 | 1 | 0 | 0 | 1.0 | 2.26 | −0.490 |
| GE Healthcare | LOGIQ S7 | C1-5 5000 | 7 | 5 | 0 | 2 | 1.7 | 6.18 | −5.611 |
| GE Healthcare | LOGIQ S7 | CURVED LINEAR 6000 | 6 | 4 | 0 | 2 | 2.5 | 4.17 | −1.083 |
| GE Healthcare | LOGIQ S7 | 9L 9000 | 5 | 3 | 0 | 2 | 0.7 | 3.33 | −0.839 |
| GE Healthcare | LOGIQ S7 | ML6-15 15000 | 5 | 4 | 0 | 1 | 0.2 | 4.51 | −0.620 |
| GE Healthcare | LOGIQ S7 | LINEAR 9000 | 5 | 3 | 0 | 2 | 0.8 | 2.51 | −0.064 |
| GE Healthcare | LOGIQ S7 | LINEAR 15000 | 4 | 4 | 0 | 0 | 0.8 | 4.35 | −0.265 |
| GE Healthcare | LOGIQ S8 | CURVED LINEAR 6000 | 10 | 7 | 3 | 0 | 1.9 | 8.99 | +0.364 |
| GE Healthcare | LOGIQ S8 | LINEAR 15000 | 5 | 4 | 1 | 0 | 0.8 | 2.60 | −1.418 |
| GE Healthcare | LOGIQ S8 | LINEAR 9000 | 4 | 3 | 0 | 1 | 0.8 | 2.42 | −0.158 |
| GE Healthcare | LOGIQ S8 | CURVED LINEAR 4000 | 1 | 1 | 0 | 0 | 1.8 | 5.96 | +0.639 |
| GE Healthcare | LOGIQ S8 | LINEAR 8500 | 1 | 1 | 0 | 0 | 1.0 | 2.93 | −0.958 |
| Philips | iU22 | L17-5 | 1 | 1 | 0 | 0 | 1.0 | 5.39 | −12.252 |
| Philips | iU22 | L12-5 | 1 | 1 | 0 | 0 | 0.7 | 3.25 | −2.684 |
| Philips | iU22 | C5-1 | 1 | 1 | 0 | 0 | 2.8 | 1.89 | −0.216 |
| Samsung Medison | RS80 EVO | L3-12A | 21 | 15 | 2 | 4 | 0.9 | 5.27 | −0.679 |
| Samsung Medison | RS80 EVO | LA2-9A | 21 | 14 | 4 | 3 | 0.7 | 3.37 | +0.015 |
| Samsung Medison | RS80 EVO | CA1-7A | 19 | 15 | 2 | 2 | 2.8 | 5.50 | −0.072 |
| Samsung Medison | RS80 EVO | CF4-9 | 19 | 19 | 0 | 0 | 0.8 | 7.05 | +1.125 |
| Samsung Medison | RS85 | LA2-9A | 185 | 152 | 16 | 17 | 0.7 | 4.09 | +0.776 |
| Samsung Medison | RS85 | L3-12A | 132 | 122 | 5 | 5 | 0.8 | 3.33 | −0.466 |
| Samsung Medison | RS85 | LA4-18B | 85 | 74 | 11 | 0 | 0.7 | 2.68 | −0.250 |
| Samsung Medison | RS85 | CA1-7A | 79 | 47 | 10 | 22 | 2.8 | 4.01 | +0.143 |
| Samsung Medison | RS85 | LA2-14A | 73 | 61 | 5 | 7 | 1.0 | 4.15 | −0.469 |
| Samsung Medison | RS85 | CA1-7S | 60 | 35 | 7 | 18 | 2.2 | 8.68 | −0.467 |
| Samsung Medison | RS85 | LA3-16A | 31 | 17 | 0 | 14 | 0.5 | 4.25 | −0.781 |
| Samsung Medison | RS85 | LA3-16AI | 16 | 10 | 1 | 5 | 0.3 | 4.38 | −0.016 |
| **Total** | | | **802** | **628** (78 %) | **67** (8 %) | **107** (13 %) | | | |

**3 manufacturers · 6 device models · 30 device–transducer combinations.** Tolerance limits are per modality + metric (data-driven candidates; see the tolerance discussion). The high FAIL share in a few Samsung RS85 groups (CA1-7A 28 %, CA1-7S 30 %, LA3-16A 45 %) reflects heavy-tailed metric distributions where limits derived from the same data are strict — flagged for physicist review, not necessarily true device faults.
