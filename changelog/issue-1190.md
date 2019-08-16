level: minor
reference: issue 1190
---

Updates a number of config variables including:

* Setting `pulse-namespace` per service is no longer supported
* Services that no longer use aws directly no longer take credentials
* Setting table names for secrets, notify, and hooks services is no longer supported

The name of the hooks last fires table has changed so you must update your static
client scopes in your deployment from including `auth:azure-table:read-write:${azureAccountId}/LastFire`
to `auth:azure-table:read-write:${azureAccountId}/LastFire3`.
