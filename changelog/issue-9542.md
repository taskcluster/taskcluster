audience: users
level: patch
reference: issue 9542
---
Hooks can no longer skip a scheduled fire if they're updated within the short window between the time they should've fired and the time the scheduler looked if they should be
