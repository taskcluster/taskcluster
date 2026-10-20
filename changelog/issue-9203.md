audience: worker-deployers
level: patch
reference: issue 9203
---
Generic Worker (Linux, with D2G enabled) no longer waits for `docker rm` before resolving a task. The task's container is stopped when the task finishes and removed in the background, since removing it can take minutes. Since this no longer delays the task, the container's anonymous volumes are removed with it again. Before pruning docker resources, the garbage collector waits for pending removals, since they may free enough space.
