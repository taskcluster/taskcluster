audience: worker-deployers
level: minor
reference: issue 8809
---
Generic-worker can register existing directories as writable caches through
`preloadedDirectoryCaches`. Each entry specifies a `cacheName` and an absolute
`location`. At startup, generic-worker registers an existing directory as a
writable cache if no cache with that name is loaded. It does not copy the
directory during registration. Missing or non-directory paths are skipped.
The normal cache lifecycle handles mounting, reuse, and eviction. On POSIX,
each directory must be on the same filesystem as `tasksDir`.
Prepared content has unknown age, so outstanding purge requests apply to it.
