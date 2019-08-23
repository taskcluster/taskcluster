---
title: Login Identities
order: 20
---

Conventionally, clients associated with a specific human user have `clientIds` of the form `<identityProviderId>/<identity>/<name>`.
The first two components are defined by the [web-server service](/docs/reference/core/web-server) based on the signed-in user's profile.

That service periodically scans for clients with client IDs of this form, and disables any clients which have more scopes than the user's profile would allow.

Some role configuration is required to allow users to create clients of this form.
This configuration can be omitted if users should not be able to create clients.
However, note that this will prevent [third-party sign-in](/docs/manual/access-control/third-party) from working correctly.

The configuration is to create a role `login-identity:*` is configured with scopes:

* `auth:create-client:<..>/*`
* `auth:delete-client:<..>/*`
* `auth:reset-access-token:<..>/*`
* `auth:update-client:<..>/*`

When a user signs in via the Taskcluster UI, the [web-server services](/docs/reference/core/web-server) associates the session with the 
One of those scopes is `assume:login-identity:<identityProviderId>/<identity>`.
The magic of [parameterized roles](/docs/reference/platform/taskcluster-auth/docs/roles#parameterized-roles) means that expands to

* `auth:create-client:<identityProviderId>/<identity>/*`
* `auth:delete-client:<identityProviderId>/<identity>/*`
* `auth:reset-access-token:<identityProviderId>/<identity>/*`
* `auth:update-client:<identityProviderId>/<identity>/*`
