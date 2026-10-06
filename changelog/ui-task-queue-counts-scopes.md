audience: deployers
level: patch
---
The public deployment scope list in the anonymous role docs now includes `queue:list-task-queues`, which the dashboard needs to show counts for task queues that worker-manager does not own.
The worker pools page now only blames missing scopes when task queue counts fail with `InsufficientScopes`, and shows the actual error otherwise.
