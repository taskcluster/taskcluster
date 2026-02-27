audience: worker-deployers
level: patch
reference: issue 8328
---
Worker Manager: the `shouldWorkerTerminate` API now uses the latest `minCapacity` setting when computing termination decisions. Previously, the worker scanner's capacity formula was inflated by existing workers, so changes to `minCapacity` (e.g., lowering from 1 to 0) had no effect on running workers.
