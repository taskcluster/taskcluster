audience: users
level: minor
reference: issue 9272
---
Generic Worker supports a new optional payload property `abortGracePeriod` (in seconds, default `0`, maximum `60`). When a task is aborted, because `maxRunTime` was exceeded, the worker is shutting down without time to finish tasks (e.g. spot termination), or the resource monitor detected sustained memory pressure, task processes are first sent `SIGTERM` and given up to `abortGracePeriod` seconds to exit, before being killed with `SIGKILL`. This lets tasks such as test harnesses record that they were aborted, and flush their logs, before they are killed. The task is still resolved as aborted. Task cancellation still kills task processes immediately. On Windows, the property is accepted but task processes are always killed immediately.
