audience: developers
level: patch
---
`yarn upgrade:node` now manages the corepack version pinned in `.corepack-version`. Its new `--corepack <auto|latest|skip|VERSION>` option defaults to `auto`, which updates corepack to the latest release whenever the Node.js version changes.
