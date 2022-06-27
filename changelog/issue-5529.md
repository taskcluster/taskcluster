audience: general
level: patch
reference: issue 5529
---
This patch makes it so that the `docker-compose.yml` file is updated with the new taskcluster docker image version on a `yarn release`. Previously, the version wasn't updated, so the `meta-generate` task would fail on releases. This issue first appeared in v44.16.4.
