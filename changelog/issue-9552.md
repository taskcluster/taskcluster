audience: worker-deployers
level: patch
reference: issue 9552
---
Generic Worker logs a warning at startup if `idleTimeoutSecs` is set on a worker managed by Worker Manager (worker-runner on aws, azure, or google), since the setting has no effect.
