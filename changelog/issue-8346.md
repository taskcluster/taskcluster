audience: admins
level: patch
reference: issue 8346
---
worker-manager now reports a consistent `runningDuration` value across the worker-removed
and worker-stopped log events for a single worker.
