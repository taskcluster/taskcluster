audience: worker-deployers
level: patch
---
Worker-runner now correctly sets the `publicIP` configuration for generic-worker (previously it set `publicIp`, which is ignored).
