audience: developers
level: silent
---
`docker-worker-chunk-{1,2,3,4,5}` tasks would non-deterministically fail during releases due to them depending on the `release-publish` task passing successfully before they run. This will be fixed by setting a dependency on `release-publish` in the `docker-worker-chunk-{1,2,3,4,5}` tasks. For now, on releases, two task groups are created, making it impossible to define a dependency on `release-publish` in the `docker-worker-chunk-{1,2,3,4,5}` tasks. Once we combine the two task groups to one, on release, this dependency can be set to fix the issue.
