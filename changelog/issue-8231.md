audience: general
level: patch
reference: issue 8231
---
Worker lifecycle log events (`worker-running`, `worker-stopped`, `worker-removed`) now include duration fields (`registrationDuration`, `workerAge`, `runningDuration`) to aid in investigating worker registration and lifetime issues.
