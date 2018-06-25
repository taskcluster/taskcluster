Taskcluster User Login Service
==============================

This service supports the generation of Taskcluster credentials appropriate to
a user.

While this service is intended to be used with interactive applications, it
does not have any user interface of its own. Instead, it relies on an OIDC
provider to handle user interaction, and issues credentials on the basis of the
resulting OIDC `access_token` .

See [getting user
creds](https://docs.taskcluster.net/reference/integrations/taskcluster-login/getting-user-creds)
for more detail about interacting with this service.

## Looking Up User Profiles

Given the necessary credentials, it is possible to use this service to retrieve a user's Auth0 profile.
This should **only** be done to help debug an issue with the affected user.
Put the credentials in a `user-config.yml` section named `lookup` and run

```shell
NODE_ENV=lookup node src/main.js show-auth0-profile '<auth0UserId>'
```

## Development and Testing

Test this like any Taskcluster microservice: install with `yarn` and then test
with `yarn test`.

To actually perform authentication in a development setting, you will need to
[request an OIDC
client](https://mozilla.service-now.com/sp?id=sc_cat_item&sys_id=1e9746c20f76aa0087591d2be1050ecb) with the following additional attributes:

 * Non-Interactive Client
 * Access to the Auth0 management API with the `read:users` scope

### Instances

`taskcluster-login` exists on two instances, stage for pre-deployment validation, and production for actual use.

## Service Owner

Service Owner: dustin@mozilla.com
