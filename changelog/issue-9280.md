audience: worker-deployers
level: patch
reference: issue 9280
---
Generic Worker on Windows multiuser makes fewer system calls per file when granting a task user control of a writable directory cache, which speeds up mounting caches with many small files. The owner of a cache entry is now only read for hardlinks (the only case where it's checked), the security descriptors are built once per cache instead of once per file, link counts are read with a single `FILE_STANDARD_INFO` query, and directories are listed through the handle already held instead of being opened a second time.
