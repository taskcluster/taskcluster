audience: worker-deployers
level: patch
---
Generic Worker with `capacity` > 1 no longer deletes a running task's directory and task user when a new run of the same task is claimed before the previous run finishes.
