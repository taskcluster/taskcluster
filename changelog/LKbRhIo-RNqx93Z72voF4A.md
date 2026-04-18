audience: general
level: patch
---
Upgrades to Node.js v24.15.0 and yarn 4.14.1. Yarn install lifecycle scripts are now disabled by default to reduce supply-chain risk; packages needing `preinstall`/`install`/`postinstall` scripts must be allowlisted via `dependenciesMeta.<pkg>.built` in the consuming `package.json`.
