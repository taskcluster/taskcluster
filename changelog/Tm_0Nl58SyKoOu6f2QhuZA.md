audience: worker-deployers
level: patch
---
Generic Worker no longer deadlocks on shutdown when `capacity` is greater than 1, or when interrupted with Ctrl+C / `SIGINT` while a task is running. Shutdown waits on task completions until no tasks remain, instead of blocking on a wait group that only advanced when those completions were processed.
