audience: worker-deployers
level: patch
reference: issue 8153
---
Generic Worker (d2g): anonymous volumes from the task container are no longer removed at the end of a task run in order to resolve the task sooner. The garbage collector was updated to take care of these instead.
