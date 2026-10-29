audience: general
level: major
---
Upgrades to Node.js latest LTS, v26.13.0.

The published `@taskcluster/client` package now requires Node.js 26 (`engines.node` is `^26`, previously `^24`), so users of the client must upgrade to Node.js 26.

Node.js no longer bundles corepack, so Taskcluster images now install the version pinned in `.corepack-version` from npm. Developers should do the same: `npm install -g corepack@$(cat .corepack-version)`.
