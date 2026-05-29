audience: developers
level: patch
reference: issue 8660
---
taskcluster-client npm package now declares `engines.node` as a `>=` range instead of an exact version, so installs no longer fail on compatible Node.js patch versions.