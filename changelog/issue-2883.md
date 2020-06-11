audience: users
level: patch
reference: issue 2883
---
Endpoints that return worker pools now contain an `existingCapacity` field that contains the total
amount of capacity for the worker pool between all workers that are not `stopped`.
