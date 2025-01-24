audience: worker-deployers
level: major
reference: issue 7464
---

Static workers always receive workerPool's workerConfig.
Previously workerConfig was stored in the worker.providerData,
which made it impossible to update config without creating new worker
