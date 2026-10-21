audience: worker-deployers
level: patch
reference: issue 9280
---
Generic Worker on Windows multiuser makes fewer system calls per file when granting a task user control of a writable directory cache, which speeds up mounting caches with many small files.
