audience: deployers
level: minor
reference: issue 7472
---
The queue service now listens for `workerRemoved` events from worker-manager and immediately resolves any tasks claimed by that worker as `exception/worker-shutdown`, triggering an automatic retry.
Previously, when a worker disappeared (due to VM preemption, crash, or manual termination), its claimed tasks would wait up to 20 minutes for the claim to expire before being retried.
This new `workerRemovedResolver` background process runs alongside the existing claim-resolver and requires no configuration changes.
