audience: worker-deployers
level: minor
reference: issue 8586
---
Fixes a bug in worker-manager where the worker-scanner could incorrectly mark a running worker as `over capacity` and tell it to terminate, even when it was the sole running worker in a pool with `minCapacity >= 1`. Caused by offset-based pagination yielding duplicate rows when other workers were inserted mid-scan, leading to conflicting termination decisions for the same worker. The provisioner had the same root cause, silently over-counting `existingCapacity` on pools with more than 1000 non-stopped workers and under-provisioning them. Both call sites now use keyset pagination via a new function `get_non_stopped_workers_with_launch_config_scanner_after` in DB version 0125. The most visible symptom was excessive worker churn on small pools.
