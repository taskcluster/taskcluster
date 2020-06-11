audience: worker-deployers
level: patch
reference: issue 3012
---
Worker runner can now re-register a worker with worker-manager, refreshing its credentials. This allows workers to run for an unlimited time, so long as they continue to check in with the worker manager periodically.  Both docker-worker and generic-worker, as of this version, support this functionality.  Older worker versions will simply terminate when their credentials expire.
