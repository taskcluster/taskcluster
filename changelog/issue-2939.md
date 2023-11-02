audience: general
level: minor
reference: issue 2939
---

Introduces `queue.listPendingTasks(taskQueueId)` and `queue.listClaimedTasks(taskQueueId)`.
Those endpoints return a list of tasks that are currently pending or claimed by workers.

New scopes introduced for those endpoints:
- `queue:pending-list:<taskQueueId>`
- `queue:claimed-list:<taskQueueId>`
