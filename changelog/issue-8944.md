audience: worker-deployers
level: patch
reference: issue 8944
---
Generic Worker no longer leaks disk space when cache files remain on disk without a cache table entry. Garbage collection and worker startup now delete anything in the caches directory that the worker does not know about, so a failed deletion (or a leftover from a crash) is retried instead of occupying space forever.
