audience: worker-deployers
level: patch
reference: issue 2969
---
Docker-worker now only considers itself idle if its call to `queue.claimWork` returns no tasks.  This prevents the situation where a very short `afterIdleSeconds` causes the worker to shut down *while* calling `claimWork`.
