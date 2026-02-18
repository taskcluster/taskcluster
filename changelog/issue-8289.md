audience: worker-deployers
level: patch
reference: issue 8289
---
Generic Worker: fixes credential expiration during high-volume artifact uploads by narrowing the scope of the queue client lock so that credential refresh is no longer blocked by in-flight HTTP calls.
