audience: worker-deployers
level: patch
reference: issue 3346
---
The Azure provider now looks only for well-understood failure-related states in the Azure API to determine when a worker has failed.  In cases where these measures miss an event, (re)registrationTimeouts will terminate the worker.
