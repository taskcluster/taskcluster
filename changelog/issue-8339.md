audience: worker-deployers
level: patch
reference: issue 8339
---
Worker Manager: provides `worker-manager:should-worker-terminate:<workerPoolId>/<workerGroup>/<workerId>` scope to worker during (re)registration so the worker can properly call out to the `ShouldWorkerTerminate` API.
