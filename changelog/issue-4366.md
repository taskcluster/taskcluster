audience: developers
level: minor
reference: issue 4366
---
Add `last_date_active` column to `queue_workers` table. Add `queue_worker_seen_with_last_date_active`, `quarantine_queue_worker_with_last_date_active`, `get_queue_worker_tqid_with_last_date_active`, and `get_queue_workers_tqid_with_last_date_active` functions for this new column.

Deprecates `quarantine_queue_worker`, `get_queue_worker_tqid`, `get_queue_workers_tqid`, and `queue_worker_seen`.
