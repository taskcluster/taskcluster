audience: worker-deployers
level: minor
reference: issue 8232
---
Worker Runner now includes system boot time when registering a new worker with Worker Manager.
Worker Manager uses this to report two new metrics: `workerProvisionDuration` (time from worker
requested to system boot) and `workerStartupDuration` (time from system boot to registration).
