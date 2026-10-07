# AutoQAD — Event-Driven Architecture Performance Test (cPouta)

**Date:** 2026-10-07
**Cluster:** cPouta 3-node kubeadm (autoqad-control 4 GB + autoqad-worker-1/-2 2 GB), k8s v1.29.15
**Architecture:** Event-driven pipeline (ingestion → SQL Server Service Broker → competing-consumer workers → S3). Replaces the earlier polling/claim/index-sharding model.
**Purpose:** Re-run the earlier horizontal-scaling test on the new architecture, with the identical 802-image ultrasound dataset.

---

## 1. Method

- **Workload:** all 802 ultrasound instances in the cPouta Orthanc (the same dataset as the earlier sharding tests). Jobs created by the ingestion service (one `us_jobs` row per instance).
- **Scaling model:** competing consumers. Each `us-worker` replica independently claims jobs from `us_jobs` atomically (`UPDATE ... WITH (READPAST, ROWLOCK, UPDLOCK)`); no index-sharding, no `SHARD_TOTAL`. Scale = `kubectl scale deployment/us-worker --replicas=R`.
- **Per replica count R ∈ {1, 2, 4}:**
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
| 4 | 802 | 802 | 0 | 162.7 | 4.93 | **2.90×** | 73 % | worker-1 + worker-2 (2 pods/node) |

**All 802 images analyzed successfully (0 failures) at every replica count.**

- The event-driven competing-consumer model scales **2.90× with 4 workers**, comparable to (slightly above) the earlier index-sharding result (~2.67× at R=4) on the same cluster + dataset.
- Scaling is sub-linear (73–78 % efficiency). The limiting factors are the **2 physical worker nodes** (CPU) and the **shared Orthanc (DICOM fetch) and single MS SQL Server** that all workers contend for. Going from 2→4 pods still improves throughput (2.67→4.93) because I/O (Orthanc fetch, DB insert) on one pod overlaps compute on another.

---

## 3. Important methodological finding — dependency bug invalidated the first run

The **first** run reported 599 completed / 203 failed and apparently-higher throughput (1.84 jobs/s at R=1). Investigation of `us_jobs.error_message` showed the dominant failure (140+) was:

```
module 'cv2' has no attribute 'linearPolar'
```

`cv2.linearPolar` (used by the ultrasound convex-probe straightening/polar transform) was **removed in OpenCV 5.0**. The worker image had floated `opencv-python>=4.10.0` → **5.0.0.93**, so convex-probe analyses crashed. The old poller uses OpenCV 4.x, which is why it never showed these failures. The ~200 "failures" were therefore a **dependency bug, not a dataset problem** — the 802-image dataset is clean.

**Fix:** pinned `opencv-python==4.11.0.86` (last 4.x, retains `linearPolar`), rebuilt the worker, re-ran. Result: **0 failures**, confirming the clean dataset. The fast-failing images had also inflated the first run's apparent throughput, so those numbers are discarded.

**Analysis-code parity (verified):** `US_IQ_analysis3.py` and `probe-LUT.xls` are byte-identical between the local source and the cPouta pod (md5 `74645456…aacc5` and `d97b8cad…ed87`); OpenCV 4.11.0 / NumPy 2.5.3 in both.

---

## 4. Caveats / notes

- **Cluster size:** 2 worker nodes bound the scaling; a wider cluster would extend it. The shared Orthanc + single SQL Server are the next bottlenecks (fetch + insert serialization).
- **Duplicate result rows:** each perf re-run re-queues and re-analyzes all 802 jobs, inserting new `ultrasound` rows each time (the worker dedups at the job level, not the result level). The table accumulated ~5× duplicates during testing; deduplicated to one row per instance afterward.
- **Metric:** span uses `started_at`/`completed_at` written by the worker on RUNNING/COMPLETED|FAILED, so it measures real processing wall-time excluding pod scheduling.
- Live metrics of each run are visible in Grafana (dashboard "AutoQAD — Event-driven skaalaus", Prometheus scrapes the `us-worker` pods on :9110).
