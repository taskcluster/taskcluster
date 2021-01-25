audience: deployers
level: patch
reference: issue 4276
---
The worker-manager service will now start up even if one of its providers is down or misconfigured.  Worker pools using that provider will not be provisioned, but other pools will continue to operate normally.
