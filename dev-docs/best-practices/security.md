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

## Protect the Platform

Where possible, the Taskcluster platform itself should be protected by other mechanisms in addition to scopes.
For example, the Auth service's `gcpCredentials` method returns credentials for GCP service accounts.
While the service accounts are limited by scopes, the method also has a list of allowed service accounts, and regardless of scopes will not create credentials for any other service account.
This means that even a user with `auth:gcp:access-token:*` cannot get credentials for critical service accounts such as those used to run the Taskcluster services deployment itself.

In part, this best-practice aligns with user expectations: operations using the API should not be able to break the Taskcluster deployment in a way that cannot be fixed via other API calls.
Equally importantly, this is a form of "defense in depth" against attacks that might compromise the Taskcluster services and then pivot to compromise CI processes that depend on the intergrity of those services.

## Integrity, Reliability, and Privacy of Pulse Messages

A correctly-configured Pulse server provides the following assurances:
 * Only those with the password for an account can publish to an AMQP exchange, so for example a message on `exchanges/taskcluster-queue/v1/task-defined` must be published by the queue service
 * Messages published to an exchange are reliably delivered to queues and on to consumers even in the face of temporary server failure
 * Anyone with an account on the pulse server can consume messages on any exchange, so messages are not secret

However, the pulse server is an external service that could be misconfigured or exploited.
In this case, messages might be maliciously deleted, injected, or modified.

As a design principle, Taskcluster services should avoid relying on the content of a message, and instead treat the message as a hint that something has changed in the backend storage.
For example, when monitoring for changes to tasks, consumers of the `task-completed` exchange use the taskId in the message to fetch the task via `queue.task(..)`, and treat the result of that API call as authoritative.
