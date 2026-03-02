audience: worker-deployers
level: patch
reference: issue 8328
---
Worker Manager: the worker scanner now uses a dedicated target capacity formula for termination decisions based on pending tasks, claimed tasks, and `minCapacity`/`maxCapacity`. Previously, the provisioning formula was reused, which inflated the target by existing worker counts, so idle workers were never terminated even when `minCapacity` was lowered to 0.
