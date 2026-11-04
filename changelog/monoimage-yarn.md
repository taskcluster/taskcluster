audience: deployers
level: patch
---
The `taskcluster/taskcluster` image includes `yarn` again; the Node.js 26 base images no longer ship it. This fixes the `monoimage-devel` image build and the entrypoint's `script/*` commands, which failed with `yarn: not found` in v115.0.0.
