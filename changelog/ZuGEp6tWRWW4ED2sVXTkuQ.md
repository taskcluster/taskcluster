audience: developers
level: minor
---

Refactored github status checks handler to do handle task status transitions in single place.

Previous implementation relied on two handlers: taskDefined and statusChanged.
For some tasks both events happened at the same time, which led to a race condition and multiple check_runs being created.
To prevent concurrent handlers overwriting newer updates, simple time-based check was added to prevent this.
