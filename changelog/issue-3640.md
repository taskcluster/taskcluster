audience: general
level: minor
reference: issue 3640
---
Notify routes can now include `on-defined`, `on-pending` and `on-running`.

`on-any` is now deprecated and there are two new alternatives:
- `on-transition` for any state transition
- `on-resolved` for terminal state (completed, failed and exception).
