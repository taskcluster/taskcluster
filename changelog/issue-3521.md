audience: users
level: minor
reference: issue 3521
---
Taskcluster-proxy now adds a `Content-Type` header to proxied requests lacking one.  While this behavior is not desirable, it matches the behavior of older versions and real tasks depend on it.
