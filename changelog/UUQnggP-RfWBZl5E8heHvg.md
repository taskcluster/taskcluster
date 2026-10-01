level: minor
audience: users
reference: bug 2070520
---
Index entries created from `index.*` routes are now capped at the expiry of the
task they point at. Tasks whose `task.extra.index.expires` is not a valid date
in the future are no longer indexed, and no longer leave an empty namespace
behind them.
