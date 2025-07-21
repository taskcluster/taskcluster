audience: general
level: patch
reference: issue 7863
---
Generic Worker (D2G): reloads cache on d2g task feature start to fix `Unable to find image '<image>' locally` issue due to garbage collection running between tasks and pruning all docker images.
