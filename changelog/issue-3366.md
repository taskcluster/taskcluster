audience: users
level: patch
reference: issue 3366
---
A serious bug in dependency handling, introduced in v35.0.0, has been fixed.  The issue occurred when a task on which more than 100 other tasks depend was resolved.  In this case, some, but not all, of the dependent tasks would be marked pending.
