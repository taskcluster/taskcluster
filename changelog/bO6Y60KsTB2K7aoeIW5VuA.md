audience: worker-deployers
level: patch
---
Generic Worker: prefer `strconv.ParseUint()` over `strconv.Atoi()` when resulting int is converted to an int type of smaller size to prevent unexpected values.
