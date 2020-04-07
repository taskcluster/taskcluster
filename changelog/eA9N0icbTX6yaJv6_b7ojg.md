audience: developers
level: patch
---
Development environments now default to a lower per-pod CPU request, which should help reduce the compute cost of idle development environments.  Run `yarn dev:init` to update these defaults for your dev environment.
