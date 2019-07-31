level: minor
reference: issue 1062
---
The taskcluster cli `rerun` action now takes a `--force` option. It will refuse to rerun non-exception, non-failed tasks without `--force`.
