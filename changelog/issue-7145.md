audience: users
level: minor
reference: issue 7145
---

Fixes inconsistency in the internal queue implementation that could lead to tasks being visible as pending in the UI
after they were resolved with `deadline-exceeded`.
