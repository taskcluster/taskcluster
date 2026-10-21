audience: developers
level: patch
---
The release tooling no longer uploads missing assets to a GitHub release that is already published. If a published release's assets don't match the build artifacts, it stops with an error that lists every asset that differs. This prepares for turning on GitHub immutable releases for `taskcluster/taskcluster`. `taskcluster/staging-releases` must keep immutable releases disabled, because staging deletes and recreates releases that use the same tag.
