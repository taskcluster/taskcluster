audience: users
level: minor
reference: issue 9272
---

When Generic Worker aborts a task because it exceeded its `maxRunTime`, or because of sustained memory pressure, it now sends `SIGTERM` to the task processes and gives them up to 10 seconds to exit (the default timeout of `docker stop`), before killing them with `SIGKILL`. This lets tasks such as test harnesses record that they were aborted, and flush their logs. The task is still resolved as failed. Task processes are still killed immediately when the task is cancelled, when the worker is shutting down without time to finish tasks (e.g. spot termination), and on Windows. Processes outside the process group of the task command, such as those running in a docker container, are not sent `SIGTERM`.
