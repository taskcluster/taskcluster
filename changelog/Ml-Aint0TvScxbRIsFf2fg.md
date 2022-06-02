audience: users
level: patch
---
Remove unneeded read access to `workers` table from `queue` service. Add read access to `task_queues` table to `worker_manager` service for `workerManager.getWorker()` method to prevent 500 permission denied SQL error.
