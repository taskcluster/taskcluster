audience: users
level: patch
reference: issue 3899
---
Docker-worker now skips gzipping artifacts with an `.lz4` extension, in addition to the [existing list of extensions](https://github.com/taskcluster/taskcluster/blob/main/workers/docker-worker/config.yml#L160-L164).
