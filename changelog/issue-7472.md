audience: deployers
level: patch
reference: issue 7472
---
The queue service's `workerRemovedResolver` now also listens for `workerStopped` events from worker-manager, in addition to `workerRemoved` events. This ensures claimed tasks are resolved as `exception/worker-shutdown` as early as possible when a worker disappears. Both events are handled idempotently, so receiving both for the same worker is safe.
