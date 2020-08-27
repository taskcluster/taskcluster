audience: worker-deployers
level: patch
reference: issue 3456
---
The `workerManager.createWorker` API method now correctly limits the `workerGroup` and `workerId` properties as described in the worker schema (38 characters, no dots).
