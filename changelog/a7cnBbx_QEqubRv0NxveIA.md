audience: users
level: patch
---
Generic Worker now resolves each index namespace once per task, so all `IndexedContent` mounts of the same namespace in a task use artifacts from the same task.
