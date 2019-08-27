---
title: GCP Credentials
---

The Auth service's `auth.gcpCredentials` method distributes credentials for GCP service accounts to callers, governed by scopes.
It takes a GCP project and a service account email.

By default, this method always fails, as no GCP projects are configured.

The projects and accounts for which the service can issue credentials are governed by the `GCP_CREDENTIALS_ALLOWED_PROJECTS` configuration.
This is a JSON string of the form

```
{
    "project-name": {
        "credentials": {..},
        "allowedServiceAccounts": [..],
    }, ..
}
```

The allowed projects are defined by the keys of the outer object, in this case just `project-name`.
The `credentials` property gives the "key" for a service account in that project that has the "Service Account Token Creator" role.
The `allowedServiceAccounts` property is a list of service account emails in that project for which the `auth` service can distribute credentials.
The API method will reject any requests for unknown projects, or for service accounts in a project that are not listed in `allowedServiceAccounts`.

The "Service Account Token Creator" role allows a service account to create tokens for *all* service account in the project.
The recommended approach is to isolate work into dedicated projects such that this restriction isn't problematic.
It is possible to create more narrowly-focused IAM policies, but this is not currently supported by the GCP console and must be done with manual calls to the GCP `setIamPolicy` API endpoint.

*NOTE*: 

The current implementation only supports one project, with any number of allowed service accounts.
Future work will allow multiple projects.
