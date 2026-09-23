audience: worker-deployers
level: minor
reference: issue 8809
---
Generic-worker can register existing directories as writable caches through
`preloadedDirectoryCaches`. Each entry specifies a `cacheName` and an absolute
`location`. Generic-worker registers each directory in place. It does not
import or copy the directory contents. Existing caches take precedence.
Missing directories are skipped. The normal cache lifecycle handles mounting,
reuse, and eviction. On POSIX, each directory must be on the same filesystem
as `tasksDir`.
Prepared content has unknown age, so outstanding purge requests apply to it.
