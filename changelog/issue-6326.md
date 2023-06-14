audience: users
level: patch
reference: issue 6326
---
Running `taskcluster group list` without a task group ID now outputs error message:

```
Error: list expects argument <taskGroupId>
```

Previously, it incorrectly outputted:

```
Error: list expects argument <taskId>
```
