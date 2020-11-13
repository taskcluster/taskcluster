audience: developers
level: minor
reference: issue 3578
---
The queue service now uses taskQueueId internally, instead of provisionerId/workerType, for worker info
purposes (provisioners, worker types and workers).
The `queue_provisioners` table is dropped and the `queue_worker_types` table is renamed to `task_queues`.

