audience: developers
level: patch
reference: issue 3733
---
The database abstraction layer now supports "online" migrations, iterating over large tables without blocking production use of those tables.  These migrations are entirely managed by the existing `db:upgrade` and `db:downgrade` functions, so this presents no change for deployers.
