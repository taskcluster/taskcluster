audience: worker-deployers
level: patch
---
Generic Worker: moves the `AbortFeature` to be the first to initialize and start up for each task. This change allows the worker to be ready for spot terminations as early as possible, so that it doesn't get preempted while it's setting up other task features, not knowing the cloud provider wants the worker to shutdown.

This will help tasks resolve properly as worker shutdown in the case where a spot termination request comes in as soon as the worker starts up. Beforehand, when this situation would happen, the task would commonly resolve as claim expired because the worker didn't have enough time to react to the preemption notice.
