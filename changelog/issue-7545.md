audience: users
level: minor
reference: issue 7545
---
Generic Worker: adds `optional` field to payload artifacts to ignore any artifact upload errors, for example, if the artifact isn't known to exist at the end of a task but you don't want the task to resolve as `failed/failed`. This makes the transition from Docker Worker --> Generic Worker (through d2g) more seamless, as Docker Worker does not resolve tasks as `failed/failed` if the artifact doesn't exist.
