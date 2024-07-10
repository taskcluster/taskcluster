audience: worker-deployers
level: patch
reference: issue 7073
---

CLI tools and generic-worker now returns short-version string if executed with `--short-version` argument:

- `generic-worker --short-version`
- `livelog --short-version`
- `websocktunnel --short-version`
- `start-worker --short-version`
- `taskcluster version --short-version`
