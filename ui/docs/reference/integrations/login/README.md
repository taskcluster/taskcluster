# Login Service

This service supports the generation of Taskcluster credentials appropriate to a user.

While this service is intended to be used with interactive applications, it does not have any user interface of its own.
Instead, it relies on an OIDC provider to handle user interaction, and issues credentials on the basis of the resulting OIDC `access_token` .

See [getting user credentials](/docs/reference/integrations/login/getting-user-creds) for more detail about interacting with this service.
