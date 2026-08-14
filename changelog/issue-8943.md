audience: worker-deployers
level: patch
reference: issue 8943
---
Generic Worker no longer garbage collects a file cache that a running task is still using in `capacity` > 1 cases.
