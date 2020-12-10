audience: developers
level: minor
reference: issue 3578
---
The tasks table uses `task_queue_id` instead of separate `provisioner_id/worker_type` to identify task queues.
This change is applied through an online migration process.
