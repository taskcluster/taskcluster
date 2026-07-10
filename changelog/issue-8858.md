audience: users
level: major
reference: issue 8858
---
The task priority `normal` is no longer accepted. `createTask`, `changeTaskPriority`, and `changeTaskGroupPriority` now reject it with a 400 `InputError`, rather than silently aliasing it to `lowest` (as `createTask` did) or, in the case of `changeTaskPriority` specifically, causing an internal error.

`normal` was marked deprecated in the queue API in 2017, when it was superseded by the current `highest`-to-`lowest` scale, but that deprecation notice was inadvertently dropped from the schema again in 2018 -- so it has looked like a supported value ever since, even though it was already being aliased to `lowest` under the hood. If any task definitions (e.g. in `.taskcluster.yml` files) still specify `priority: normal`, update them to `lowest` (or another priority from the standard scale) before upgrading.
