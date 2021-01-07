audience: developers
level: patch
reference: issue 4226
---
The `yarn generate` command no longer combines redundant lines in `yarn.lock` files, so that automatic dependency upgrade PRs will succeed.  Run `yarn minify` to do this manually.
