audience: worker-deployers
level: minor
reference: issue 7840
---
Generic Worker: adds `status` subcommand to output task ID if a task is currently being executed.

Example output while a task is running:

```bash
$ generic-worker status
{
  "taskRunning": true,
  "currentTaskId": "fz7IO4uCTtevuLBoq8Qz3w"
}
```

Example output while worker is idle:

```bash
$ generic-worker status
{
  "taskRunning": false
}
```
