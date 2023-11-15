audience: general
level: patch
reference: issue 6671
---

Introduces `workerManager.workerPoolErrorStats()` to return total number of errors for any worker pool or all worker pools.
Stats are split into totals by day, hour, kind of error and error code.
Worker Pool errors are kept in db for 7 days.
