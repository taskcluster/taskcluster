audience: users
level: minor
reference: issue 8695
---
The worker-manager `workerPoolErrorStats` API now accepts optional `from` and `to`
query parameters to compute error statistics over an arbitrary time range, and the
worker-manager errors UI page lets you select that range. Defaults preserve the
previous last-24-hours/last-7-days behavior.
