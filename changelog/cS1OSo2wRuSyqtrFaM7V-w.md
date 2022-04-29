audience: developers
level: patch
---
`docker-worker-chunk-{1,2,3,4,5}` tasks would non-deterministically fail during releases due to them depending on the `release-publish` task passing successfully before they run. This was fixed by setting a dependency on `release-publish` in the `docker-worker-chunk-{1,2,3,4,5}` tasks.
