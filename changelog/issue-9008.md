audience: worker-deployers
level: patch
reference: issue 9008
---
Generic worker now purges a task's writable directory caches when the worker
kills the task's commands (cancellation, max runtime, OOM), instead of keeping
a potentially corrupt cache
