audience: worker-deployers
level: minor
reference: issue 7465
---

`WorkerManager.createWorker()` API call handles non-unique errors and responds with `409`
if worker with same `workerId` already exists in the pool
