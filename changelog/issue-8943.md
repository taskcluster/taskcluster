audience: worker-deployers
level: patch
reference: issue 8943
---
Generic Worker no longer garbage collects a file cache that a running task is still using in `capacity` > 1 cases. Relatedly, when a cached download no longer matches a task's required SHA256, the stale entry is now dropped from the cache table immediately (with its deletion deferred until any tasks still using it finish) instead of being served to the task again.
