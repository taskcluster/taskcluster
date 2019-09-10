# Using Scopes and Roles

## When To Require A Role

When verifying the scopes for an API call or some other operation, the default behavior should be to check for appropriately-parameterized scopes.
These answer the question, "Can the caller do X".

However, when the operation modifies an object which will later perform actions using a role, then it is appropriate to require that the caller possess that role.
For example, hooks trigger tasks using role `hook-id:<hookGroupId>/<hookId>`, so the API calls to create and modify the hook require `assume:hook-id:<hookGroupId>/<hookId>` directly.
It is not enough simply to possess the role's extended scopes -- the caller must possess the assumed role itself.

## Persisting Scopes in a Resource

When modifying or creating a resource that will later perform actions on behalf of the _resource creator_,
the scopes delegated by the resource creator should be explicitly specified and saved in the resource.
For example, a task can perform actions on behalf of the _task creator_, however, the scopes delegated to the
task must be explicitly given in `task.scopes`. The service (in the case the queue) is naturally responsible
verifying that the task creator possesses the scopes specified in `task.scopes`.

Services should generally prefer to avoid storing lists of scopes in resources. It makes sense to store a list of
scopes in a temporary resources such as a task which has a fixed deadline. But permanent resources like workers
or hooks should not contain a list of assigned scopes. Instead they should encode their identity in a role and
assume this role when performing actions. For example, a `workerType` in the AWS provisioner doesn't contain a
list of assigned scopes, instead the worker assumes the role `worker-type:<provisionerId>/<workerType>`.

Following this pattern for permanent resources ensures that any permanent grant of authority can be inspected through roles.

## Encoding Information In Roles

Scopes should only ever be used to evaluate scope satisfaction; never pattern match scopes to try to extract information from them.

A common example of this error is in trying to determine a user's identity based on their credentials.
Since the `taskcluster-login` service helpfully adds scopes like `assume:mozilla-user:example@example.com`, it is tempting to look for a scope matching that pattern and extract the email address.

This has a few awkward failure modes, though.
Administrative users may have multiple matching scopes, or even `assume:mozilla-user:*`.
Even if those administrative users should avoid using your service with such powerful credentials, it's easy to do accidentally and incautious code may assume the user is named `*`.
Other credentials may have no matching scope, but still possess the scopes to authorize the bearer to perform an operation.
Basically, scopes do not communicate information -- they only allow satisfaction checks.

The appropriate way to determine a user's identity (as described in [Third Party Integration](/docs/manual/integrations/apis/3rdparty)) is to find an email from some less trustworthy source such as the clientId, and then *verify* that email against the scopes, by asking "is `assume:mozilla-user:<email>` satisfied?"
