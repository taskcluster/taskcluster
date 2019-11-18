level: major
---
The auth service no longer accepts Helm configuration properties `auth.client_table_name` or `auth.role_container_name`.  These values are now assumed to be `Clients` and `auth-production-roles`, respectively.  No known deployments of Taskcluster use any other value.

The auth service now honors `sentry_organization`, `sentry_host`, `sentry_team`, and `sentry_key_prefix`.  Previously, the values of these properties were ignored.
