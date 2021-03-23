audience: deployers
level: patch
reference: issue 3981
---
The new `queue.taskClaimTimeout` Helm configuration parameter controls the duration of the task claim that `queue.claimWork` returns.  The default is 20 minutes, matching the previous hard-coded setting.
