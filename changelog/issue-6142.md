audience: worker-deployers
level: minor
reference: issue 6142
---

Worker manager force stops instances that are running but are not claiming any tasks (not visible to the queue).
This is a safety mechanism to prevent workers from running indefinitely when generic-worker (or docker-worker) fails to start properly or died for some reason (like OOM) and can no longer shutdown itself.
