audience: worker-deployers
level: minor
reference: issue 8809
---
Generic-worker can import preloaded writable directory caches through the
`preloadedDirectoryCaches` configuration option on all supported platforms.
At startup, it copies each seed into `cachesDir`, records the completed cache,
and removes the seed. Existing caches remain in use. Missing or invalid seeds
produce a warning and allow tasks to use the normal empty-cache path.
