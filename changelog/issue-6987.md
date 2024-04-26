audience: users
level: patch
reference: issue 6987
---
Generic Worker now checks if a graceful termination was requested from worker runner _before_ calling `queue.claimWork()`.

This helps fix a race condition where a preemption occurs right after Generic Worker starts up, but before the graceful termination handler to abort the task has been initialized.
