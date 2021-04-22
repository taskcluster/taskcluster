audience: worker-deployers
level: patch
reference: issue 4765
---
Native "Apple silicon" binaries of taskcluster-proxy, livelog, start-worker and generic-worker are provided (darwin-arm64). The darwin amd64 executables no longer need to be run through Rosetta 2 binary translation on darwin/arm64 workers.
