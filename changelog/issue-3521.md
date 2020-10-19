audience: users
level: minor
reference: issue 3521
---
Taskcluster-proxy now adds a `Content-Type` header to proxied requests lacking one.  While this behavior is not desirable, it matches the behavior of older versions and real tasks depend on it.  A future version of Taskcluster will drop this behavior.

When this occurs, the worker will log a message containing the string "Adding missing Content-Type header".  Use this logging to find tasks that fail to include the `Content-Type` header and adjust accordingly.
