# Login Service

This service supports the generation of Taskcluster credentials appropriate to a user.

## Development and Testing

No special configuration is required for development.

Run `yarn workspace taskcluster-login test` to run the tess.
Some of the tests will be skipped without additional credentials, but it is fine to make a pull request as long as no tests fail.

To run *all* tests, you will need appropriate Taskcluster credentials.
Using [taskcluster-cli](https://github.com/taskcluster/taskcluster-cli), run `eval $(taskcluster signin --scope assume:project:taskcluster:tests:taskcluster-login)`, then run the tests again.

To actually perform authentication in a development setting, you will need to
[request an OIDC
client](https://mozilla.service-now.com/sp?id=sc_cat_item&sys_id=1e9746c20f76aa0087591d2be1050ecb) with the following additional attributes:

 * Non-Interactive Client
 * Access to the Auth0 management API with the `read:users` scope
