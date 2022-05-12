audience: users
level: patch
reference: issue 5363
---
The generic-worker no longer resolves tasks as exception that mount a file/directory that has disappeared from the file system. Instead it invalidates the cache entry.
