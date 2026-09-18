audience: worker-deployers
level: minor
reference: issue 8809
---
Generic-worker can register existing directories as writable caches through
`preloadedDirectoryCaches`. Each entry specifies a `cacheName` and an absolute
`location`. Existing caches take precedence. Missing directories are skipped.
The normal cache lifecycle handles mounting, reuse, and eviction.
