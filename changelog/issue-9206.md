audience: deployers
level: patch
reference: issue 9206
---
Worker Manager now computes a worker pool's worker counts and capacities only when it actually returns them, in the `workerPool` and `createWorkerPool` endpoints. Previously every worker pool lookup computed them, including each `registerWorker` call, the worker scanner, and provider error reporting. That query reads every worker row in the pool, so a large pool scaling up quickly could drive database CPU to 100% as each newly booted worker registered.
