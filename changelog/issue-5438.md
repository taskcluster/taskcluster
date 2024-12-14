audience: users
level: major
reference: issue 5438
---
Added audit history tracking for clients, roles, secrets, and hooks.
History can be queried using `auth.getEntityHistory(type, entityId)` and is retained for 30 days.
