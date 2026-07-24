audience: users
level: patch
---
Fixed a bug in the auth service where purging an expired client recorded the
deletion in the audit history as `created` instead of `expired`
