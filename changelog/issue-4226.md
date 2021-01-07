audience: developers
level: patch
reference: issue 4226
---
The `yarn generate` command no longer performs minifcation of `yarn.lock` files, so that automatic dependency upgrade PRs will succeed.  Run `yarn minify` to do this manually.
