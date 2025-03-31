audience: worker-deployers
level: minor
reference: issue 6464
---
Generic Worker: adds memory usage monitoring during tasks and reports average and peak memory used, in addition to the system's total available memory.

If the total percentage of memory used exceeds 90% for 5 consecutive measurements at 0.5s intervals, the worker will abort the task to prevent OOM crashes and errors. If `disableOOMProtection` (default `false`) is set to `true` in the worker configuration, the worker will continue to monitor and report on memory usage, but will not abort the task if memory consumption is high.

Resource monitoring can be disabled with worker config `enableResourceMonitor` (default `true`) or per task via `payload.features.resourceMonitor` (default `true`).
