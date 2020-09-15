audience: worker-deployers
level: patch
reference: issue 3058
---
The worker-manager's Azure provider now more accurately tracks the state of workers, and will not mark a worker RUNNING until it has called `registerWorker`.
