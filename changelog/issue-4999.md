audience: admins
level: patch
reference: issue 4999
---
The registration-error-warning, logged from the Azure provider's register()
function in worker-manager, now includes workerPoolId, providerID, and
workerID in its context.

When register-error-warning is due to the state not being REQUESTED,
the workerState is also in the context.
