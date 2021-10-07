audience: admins
level: minor
reference: issue 4999
---
Add workerPoolId, providerId, and workerId to registration-error-warning
context, logged from the Azure provider's register() function in
worker-manager.

Add workerState to the warning context when the state is not REQUESTED,
to help diagnose registration with an unexpected state.
