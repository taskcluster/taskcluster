audience: admins
level: minor
reference: issue 6247
---

Worker manager now also quarantines worker on `removeWorker` call. This is used to prevent some race conditions when worker is still polling for new work and is removed/shutdown at the same time.

This also requires configuration changes so that `static/taskcluster/worker-manager` client would be able to quarantine workers: adding `queue:quarantine-worker:<..>/*` scope to the `worker-type:*` role should be enough.
