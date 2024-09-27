audience: worker-deployers
level: minor
reference: issue 7052
---

Worker-manager now uses number of claimed tasks during estimation process to avoid having too much idling workers.
`queue.pendingTasks` is being deprecated in favour of `queue.taskQueueCounts` which includes both pending and claimed tasks counts.
