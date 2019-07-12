# Security

## Microservice Isolation 

Each microservice should have the fewest secrets and minimal access that it requires.
This provides a "barrier" to prevent a compromise of a single service from affecting the entire platform.

For example, each service has access only to its own DB tables, and not those of any other service.

When a service uses its Taskcluster credentials to call other API methods on behalf of users, its credentials should be based on the roles given to the users.
A concrete example is the hooks service, which uses its credentials to call `queue.createTask` on behalf of users, using `authorizedScopes` of the form `['assume:hook-id:<hookGroupId>/<hookId>']`.
Instead of using credentials with the scope `*`, the hooks service's credentials have `assume:hook-id:*`, thus limiting its access to only the minimal scopes it needs to create tasks for hooks.

The exceptions to this rule are the platform services: auth and queue.
The auth service is the arbiter of all Taskcluster credentials, so it implicitly has all scopes.
The queue service's credentials must satisfy any values it finds in `task.scopes`, so they have scope `*`.
