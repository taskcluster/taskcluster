audience: developers
level: patch
reference: issue 8660
---
taskcluster-client npm package now declares `engines.node` as a bounded range (e.g. `>=24.16.0 <25.0.0`) instead of an exact version, so engine-strict installs no longer fail on compatible patch releases of the supported Node.js major line, while still excluding the next major.
