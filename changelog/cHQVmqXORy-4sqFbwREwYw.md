audience: developers
level: patch
---
The `yarn dev:init` command since 29.2.3 would create `procs` entries for `write_docs` and `expireSentry` that would cause `yarn dev:apply` to fail.  That has been fixed, but such entries must be manually removed from `dev-config.yml` if they have already been added.
