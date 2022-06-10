audience: general
level: patch
---
This fixes the default worker state of a worker not known by worker manager to be `standalone` as opposed to `unmanaged` to be consistent with the rest of the project. This issue was first brought up in v44.16.0
