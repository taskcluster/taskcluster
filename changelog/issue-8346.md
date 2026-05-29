audience: admins
level: patch
reference: issue 8346
---
worker-manager now emits distinct, non-overlapping lifecycle durations: `runningDuration`
(registered → removal requested) on both the worker-removed and worker-stopped log events, and
a new `deprovisionDuration` (removal requested → resources observed gone) on worker-stopped.
This preserves the real deprovisioning latency between the two terminal events instead of
collapsing them to a single timestamp.
