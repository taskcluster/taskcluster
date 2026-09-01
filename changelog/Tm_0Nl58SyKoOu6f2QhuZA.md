audience: worker-deployers
level: patch
---
Generic Worker no longer deadlocks on shutdown when `capacity` is greater than 1, or when interrupted with Ctrl+C / `SIGINT` while a task is running. Shutdown paths waited for all tasks to finish without processing their completions, so the wait group never reached zero and the worker hung.
