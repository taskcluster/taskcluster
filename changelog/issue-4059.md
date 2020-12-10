audience: general
level: patch
reference: issue 4059
---
Fixed an issue fetching GitHub metadata when using a Taskcluster instance without the anonymous role.

This presented as unexpected 'Failed to get your artifact.' errors.
