# Worker-Runner to Generic-Worker Port Tracker

This document tracks all features that existed in `tools/worker-runner/` and
their porting status into generic-worker, as part of PR #6229 (remove
worker-runner).

## Background

Worker-runner was originally extracted from generic-worker to serve both
generic-worker and docker-worker. Now that docker-worker is retired, the code
is being moved back into generic-worker. This tracker ensures no functionality
is lost in the transition.

## Feature Porting Status

### Cloud Provider Configuration

- [x] **AWS provider** (`--configure-for-aws`) — `aws.go`
- [x] **GCP provider** (`--configure-for-gcp`) — `gcp.go`
- [x] **Azure provider** (`--configure-for-azure`) — `azure.go`
- [x] **Static provider** (`--configure-for-static --static-secret SECRET`) —
  `static.go`. Registers with worker-manager using a shared static secret.
  Requires config file with rootURL, provisionerId, workerType, workerGroup,
  and workerId set.
- [x] **Standalone provider** — N/A. This was just "run with pre-configured
  credentials and a config file", which is generic-worker's default mode.

### Registration & Credentials

- [x] **RegisterWorker API call** — `workermanager.go`
- [x] **SystemBootTime in RegisterWorker** — Uses `go-sysinfo` (already
  imported). Added to `workermanager.go`.
- [x] **Credential renewal (reregisterWorker)** — `startCredentialRenewal()`
  in `workermanager.go` calls `ReregisterWorker` before credentials expire,
  then updates credentials via `config.UpdateCredentials()`. Uses
  `renewBeforeExpire()` (ported from worker-runner) to calculate renewal
  timing. Falls back to graceful termination if renewal fails.
- [x] **Non-monotonic clock for credential timer** — The credential renewal
  goroutine polls wall-clock time (using `time.Now().Round(0)` to strip
  monotonic component) so the timer survives VM hibernation.

### Secrets & Configuration

- [x] **Secrets fetching** — Done in `bootstrap.go` via `Bootstrap()`, which
  fetches `worker-pool:<workerPoolId>` from tc-secrets.
- [x] **Worker config merging** — Config from worker pool definition is merged
  via `MergeInJSON` in `bootstrap.go`.

### File Extraction

- [x] **Basic file extraction** — `fileutil.File.Extract()` writes plain text
  content to disk.
- [x] **Base64 encoding support** — `fileutil.File` supports
  `"encoding": "base64"` for binary content.
- [x] **Zip format extraction** — `fileutil.File` supports
  `"format": "zip"` to extract zip archives with Zip Slip protection.

### Termination Detection

- [x] **AWS spot termination polling** — 5-second polling of
  `/meta-data/spot/termination-time`. Calls `graceful.Terminate(false)`. Wired
  into `RunWorker()` via `startTerminationPolling()`.
- [x] **AWS startup termination check** — Handled by termination polling which
  starts immediately in `RunWorker()` and detects termination within 5 seconds.
- [x] **GCP preemption detection** — Hanging GET on
  `/instance/preempted?wait_for_change=true`. Calls
  `graceful.Terminate(false)`.
- [x] **GCP startup preemption check** — Handled by preemption polling which
  starts immediately in `RunWorker()` via hanging GET.
- [x] **Azure scheduled events polling** — 1-second polling (per Microsoft
  recommendation). Skips `Freeze` events, terminates on all others.
- [x] **Azure does NOT check at startup** — Intentional; the scheduled events
  endpoint takes up to 120s on first call, which would delay startup.

### Shutdown & Cleanup

- [x] **RemoveWorker on shutdown** — `removeWorker()` in `workermanager.go`
  calls `workerManager.RemoveWorker()` when shutting down
  dynamically-provisioned workers. Called from `main.go` after `RunWorker()`
  returns.
- [x] **Graceful termination on idle timeout** — `shutdownWorker` calls
  `host.ImmediateShutdown()` directly.

### API Version Updates

- [x] **AWS IMDSv2** — `aws.go` uses token-based IMDSv2 instead of deprecated
  IMDSv1.
- [x] **Azure metadata API version** — Updated from `2019-04-30` to
  `2025-04-07` for instance metadata and attested document endpoints.
- [x] **Azure scheduled events API version** — Uses `2020-07-01`.

### Error Reporting

- [x] **Error reporting to worker-manager** — `reportWorkerError()` in
  `workermanager.go` calls the `reportWorkerError` API directly (no protocol
  needed). Called from `exitOnError` when credentials are available.

### Not Applicable / Intentionally Omitted

- **Worker-runner protocol** — Removed entirely. Communication between
  worker-runner and generic-worker was via a stdio/pipe protocol
  (`tools/workerproto/`). No longer needed since the code is in one process.
- **Logging abstraction** — Worker-runner had a pluggable logging system
  (`tools/worker-runner/logging/`). Generic-worker uses Go's standard `log`
  package. No need to port.
- **Cache over restarts** — Worker-runner could cache registration state across
  reboots (`run/state.go`, `CacheOverRestarts` config). This was
  worker-runner-specific for preserving state when worker-runner restarts the
  worker process. Not needed when everything is one process.
- **OOM score adjustment** — Worker-runner set its own OOM score to avoid being
  killed by the Linux OOM killer (`util/oom_linux.go`). This is a
  process-protection measure, not a feature generic-worker needs to replicate.
- **Docker-worker support** — Removed. Docker-worker is retired.

## Priority Order for Remaining Work

All items have been implemented. No remaining work.

## Worker-Runner Git History Analysis

The following substantive changes were made to worker-runner since this PR was
originally created (March 2024). All have been addressed:

| Date | Commit | Change | Status |
|------|--------|--------|--------|
| 2026-02-09 | `a8c4ecc107` | SystemBootTime in RegisterWorker | Ported |
| 2025-12-15 | `2342951d2d` | Unregister workers on idle timeout (protocol-based) | N/A (protocol removed) |
| 2025-09-08 | `4e6ebcb6e3` | Windows service exit code for reboots | N/A (worker-runner-specific) |
| 2025-08-19 | `06a10184ce` | Azure API version → 2025-04-07 | Ported |
| 2025-08-12 | `c7dae2deb9` | Azure polling interval → 1 second | Ported |
| 2024-09-26 | `f6858b38a8` | Replace deprecated OOM adjuster | N/A |
| 2024-08-02 | `4c9e2d46f1` | AWS spot polling → 5 seconds | Ported |
| 2024-06-25 | `0ec4e74256` | AWS IMDSv2 | Ported |
| 2024-04-05 | `e55411d7ae` | Azure: skip Freeze events | Ported |
| 2024-03-22 | `5bd42a72f8` | GCP: hanging GET for preemption | Ported |
| 2024-01-30 | `f23574f8d6` | GCP: startup preemption check | Ported |
| 2023-10-02 | `1e40a2be79` | TASKCLUSTER_WORKER_LOCATION | Ported |
| 2023-09-06 | `08801d0f22` | GCP preemption notifications | Ported (superseded by hanging GET) |
