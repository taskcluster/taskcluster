audience: worker-deployers
level: minor
reference: issue 3033
---
The worker-manager updates the `expires` timestamp for AWS workers that are set to expire in less than a day.
Updating the `expires` timestamp is now handled in the worker-scanner scan() loop for all providers.
