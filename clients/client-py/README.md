# Taskcluster Client for Python

[![Build Status](https://travis-ci.org/taskcluster/taskcluster-client.py.svg?branch=master)](https://travis-ci.org/taskcluster/taskcluster-client.py)

This is a library used to interact with Taskcluster within Python programs.  It
presents the entire REST API to consumers as well as being able to generate
URLs Signed by Hawk credentials.  It can also generate routing keys for
listening to pulse messages from Taskcluster.

The library builds the REST API methods from the Taskcluster API definitions provided in the [Taskcluster repository](https://github.com/taskcluster/taskcluster).

## Generating Temporary Credentials
If you have non-temporary taskcluster credentials you can generate a set of
temporary credentials as follows. Notice that the credentials cannot last more
than 31 days, and you can only revoke them by revoking the credentials that was
used to issue them (this takes up to one hour).

It is not the responsibility of the caller to apply any clock drift adjustment
to the start or expiry time - this is handled by the auth service directly.

```python
import datetime

start = datetime.datetime.now()
expiry = start + datetime.timedelta(0,60)
scopes = ['ScopeA', 'ScopeB']
name = 'foo'

credentials = taskcluster.createTemporaryCredentials(
    # issuing clientId
    clientId,
    # issuing accessToken
    accessToken,
    # Validity of temporary credentials starts here, in timestamp
    start,
    # Expiration of temporary credentials, in timestamp
    expiry,
    # Scopes to grant the temporary credentials
    scopes,
    # credential name (optional)
    name
)
```

You cannot use temporary credentials to issue new temporary credentials.  You
must have `auth:create-client:<name>` to create a named temporary credential,
but unnamed temporary credentials can be created regardless of your scopes.

## API Documentation

The REST API methods are documented in the [reference docs](https://docs.taskcluster.net/docs/reference).

## Query-String arguments
Query string arguments are now supported.  In order to use them, you can call
a method like this:

```python
queue.listTaskGroup('JzTGxwxhQ76_Tt1dxkaG5g', query={'continuationToken': outcome.get('continuationToken')})
```

These query-string arguments are only supported using this calling convention

## Sync vs Async

The objects under `taskcluster` (e.g., `taskcluster.Queue`) are
python2-compatible and operate synchronously.


The objects under `taskcluster.aio` (e.g., `taskcluster.aio.Queue`) require
`python>=3.6`. The async objects use asyncio coroutines for concurrency; this
allows us to put I/O operations in the background, so operations that require
the cpu can happen sooner. Given dozens of operations that can run concurrently
(e.g., cancelling a medium-to-large task graph), this can result in significant
performance improvements. The code would look something like

```python
#!/usr/bin/env python
import aiohttp
import asyncio
from taskcluster.aio import Auth

async def do_ping():
    with aiohttp.ClientSession() as session:
        a = Auth(session=session)
        print(await a.ping())

loop = asyncio.get_event_loop()
loop.run_until_complete(do_ping())
```

Other async code examples are available [here](#methods-contained-in-the-client-library).

Here's a slide deck for an [introduction to async python](https://gitpitch.com/escapewindow/slides-sf-2017/async-python).

## Usage

* Here's a simple command:

    ```python
    import taskcluster
    index = taskcluster.Index({
      'rootUrl': 'https://tc.example.com',
      'credentials': {'clientId': 'id', 'accessToken': 'accessToken'},
    })
    index.ping()
    ```

* There are four calling conventions for methods:

    ```python
    client.method(v1, v1, payload)
    client.method(payload, k1=v1, k2=v2)
    client.method(payload=payload, query=query, params={k1: v1, k2: v2})
    client.method(v1, v2, payload=payload, query=query)
    ```

* Options for the topic exchange methods can be in the form of either a single
  dictionary argument or keyword arguments.  Only one form is allowed

    ```python
    from taskcluster import client
    qEvt = client.QueueEvents({rootUrl: 'https://tc.example.com'})
    # The following calls are equivalent
    qEvt.taskCompleted({'taskId': 'atask'})
    qEvt.taskCompleted(taskId='atask')
    ```

## Generating URLs

It is often necessary to generate the URL for an API method without actually calling the method.
To do so, use `buildUrl` or, for an API method that requires authentication, `buildSignedUrl`.

```python
import taskcluster

index = taskcluster.Index(taskcluster.optionsFromEnvironment())
print(index.buildUrl('findTask', 'builds.v1.latest'))
secrets = taskcluster.Secrets(taskcluster.optionsFromEnvironment())
print(secret.buildSignedUrl('get', 'my-secret'))
```

Note that signed URLs are time-limited; the expiration can be set with the `signedUrlExpiration` option to the client constructor, or with the `expiration` keyword arguement to `buildSignedUrl`, both given in seconds.

## Root URL

This client requires a `rootUrl` argument to identify the Taskcluster
deployment to talk to.  As of this writing, the production cluster has rootUrl
`https://taskcluster.net`.

## Environment Variables

As of version 6.0.0, the client does not read the standard `TASKCLUSTER_…`
environment variables automatically.  To fetch their values explicitly, use
`taskcluster.optionsFromEnvironment()`:

```python
auth = taskcluster.Auth(taskcluster.optionsFromEnvironment())
```

## Pagination
There are two ways to accomplish pagination easily with the python client.  The first is
to implement pagination in your code:
```python
import taskcluster
queue = taskcluster.Queue({'rootUrl': 'https://tc.example.com'})
i = 0
tasks = 0
outcome = queue.listTaskGroup('JzTGxwxhQ76_Tt1dxkaG5g')
while outcome.get('continuationToken'):
    print('Response %d gave us %d more tasks' % (i, len(outcome['tasks'])))
    if outcome.get('continuationToken'):
        outcome = queue.listTaskGroup('JzTGxwxhQ76_Tt1dxkaG5g', query={'continuationToken': outcome.get('continuationToken')})
    i += 1
    tasks += len(outcome.get('tasks', []))
print('Task Group %s has %d tasks' % (outcome['taskGroupId'], tasks))
```

There's also an experimental feature to support built in automatic pagination
in the sync client.  This feature allows passing a callback as the
'paginationHandler' keyword-argument.  This function will be passed the
response body of the API method as its sole positional arugment.

This example of the built in pagination shows how a list of tasks could be
built and then counted:

```python
import taskcluster
queue = taskcluster.Queue({'rootUrl': 'https://tc.example.com'})

responses = []

def handle_page(y):
    print("%d tasks fetched" % len(y.get('tasks', [])))
    responses.append(y)

queue.listTaskGroup('JzTGxwxhQ76_Tt1dxkaG5g', paginationHandler=handle_page)

tasks = 0
for response in responses:
    tasks += len(response.get('tasks', []))

print("%d requests fetch %d tasks" % (len(responses), tasks))
```

## Logging
Logging is set up in `taskcluster/__init__.py`.  If the special
`DEBUG_TASKCLUSTER_CLIENT` environment variable is set, the `__init__.py`
module will set the `logging` module's level for its logger to `logging.DEBUG`
and if there are no existing handlers, add a `logging.StreamHandler()`
instance.  This is meant to assist those who do not wish to bother figuring out
how to configure the python logging module but do want debug messages


## SlugIDs

To generate slugIds (Taskcluster's client-generated unique IDs), use
`taskcluster.slugId()`, which will return a unique slugId on each call.

In some cases it is useful to be able to create a mapping from names to
slugIds, with the ability to generate the same slugId multiple times.
The `taskcluster.stableSlugId()` function returns a callable that does
just this.

```python
gen = taskcluster.stableSlugId()
sometask = gen('sometask')
assert gen('sometask') == sometask  # same input generates same output
assert gen('sometask') != gen('othertask')

gen2 = taskcluster.stableSlugId()
sometask2 = gen('sometask')
assert sometask2 != sometask  # but different slugId generators produce
                              # different output
```

## Scopes
The `scopeMatch(assumedScopes, requiredScopeSets)` function determines
whether one or more of a set of required scopes are satisfied by the assumed
scopes, taking *-expansion into account.  This is useful for making local
decisions on scope satisfaction, but note that `assumed_scopes` must be the
*expanded* scopes, as this function cannot perform expansion.

It takes a list of a assumed scopes, and a list of required scope sets on
disjunctive normal form, and checks if any of the required scope sets are
satisfied.

Example:

```
    requiredScopeSets = [
        ["scopeA", "scopeB"],
        ["scopeC:*"]
    ]
    assert scopesMatch(['scopeA', 'scopeB'], requiredScopeSets)
    assert scopesMatch(['scopeC:xyz'], requiredScopeSets)
    assert not scopesMatch(['scopeA'], requiredScopeSets)
    assert not scopesMatch(['scopeC'], requiredScopeSets)
```

## Relative Date-time Utilities
A lot of taskcluster APIs requires ISO 8601 time stamps offset into the future
as way of providing expiration, deadlines, etc. These can be easily created
using `datetime.datetime.isoformat()`, however, it can be rather error prone
and tedious to offset `datetime.datetime` objects into the future. Therefore
this library comes with two utility functions for this purposes.

```python
dateObject = taskcluster.fromNow("2 days 3 hours 1 minute")
# datetime.datetime(2017, 1, 21, 17, 8, 1, 607929)
dateString = taskcluster.fromNowJSON("2 days 3 hours 1 minute")
# '2017-01-21T17:09:23.240178Z'
```

By default it will offset the date time into the future, if the offset strings
are prefixed minus (`-`) the date object will be offset into the past. This is
useful in some corner cases.

```python
dateObject = taskcluster.fromNow("- 1 year 2 months 3 weeks 5 seconds");
# datetime.datetime(2015, 10, 30, 18, 16, 50, 931161)
```

The offset string is ignorant of whitespace and case insensitive. It may also
optionally be prefixed plus `+` (if not prefixed minus), any `+` prefix will be
ignored. However, entries in the offset string must be given in order from
high to low, ie. `2 years 1 day`. Additionally, various shorthands may be
employed, as illustrated below.

```
  years,    year,   yr,   y
  months,   month,  mo
  weeks,    week,         w
  days,     day,          d
  hours,    hour,         h
  minutes,  minute, min
  seconds,  second, sec,  s
```

The `fromNow` method may also be given a date to be relative to as a second
argument. This is useful if offset the task expiration relative to the the task
deadline or doing something similar.  This argument can also be passed as the
kwarg `dateObj`

```python
dateObject1 = taskcluster.fromNow("2 days 3 hours");
dateObject2 = taskcluster.fromNow("1 year", dateObject1);
taskcluster.fromNow("1 year", dateObj=dateObject1);
# datetime.datetime(2018, 1, 21, 17, 59, 0, 328934)
```

## Methods contained in the client library

<!-- START OF GENERATED DOCS -->

### Methods in `taskcluster.Auth`
```python
import asyncio # Only for async 
import taskcluster
import taskcluster.aio

# Create Auth client instance
auth = taskcluster.Auth(options)
# Below only for async instances, assume already in coroutine
loop = asyncio.get_event_loop()
session = taskcluster.aio.createSession(loop=loop)
asyncAuth = taskcluster.aio.Auth(options, session=session)
```
Authentication related API end-points for Taskcluster and related
services. These API end-points are of interest if you wish to:
  * Authorize a request signed with Taskcluster credentials,
  * Manage clients and roles,
  * Inspect or audit clients and roles,
  * Gain access to various services guarded by this API.

#### Ping Server
Respond without doing anything.
This endpoint is used to check that the service is up.


```python
# Sync calls
auth.ping() # -> None
# Async call
await asyncAuth.ping() # -> None
```

#### List Clients
Get a list of all clients.  With `prefix`, only clients for which
it is a prefix of the clientId are returned.

By default this end-point will try to return up to 1000 clients in one
request. But it **may return less, even none**.
It may also return a `continuationToken` even though there are no more
results. However, you can only be sure to have seen all results if you
keep calling `listClients` with the last `continuationToken` until you
get a result without a `continuationToken`.


Has required output schema

```python
# Sync calls
auth.listClients() # -> result
# Async call
await asyncAuth.listClients() # -> result
```

#### Get Client
Get information about a single client.



Takes the following arguments:

  * `clientId`

Has required output schema

```python
# Sync calls
auth.client(clientId) # -> result
auth.client(clientId='value') # -> result
# Async call
await asyncAuth.client(clientId) # -> result
await asyncAuth.client(clientId='value') # -> result
```

#### Create Client
Create a new client and get the `accessToken` for this client.
You should store the `accessToken` from this API call as there is no
other way to retrieve it.

If you loose the `accessToken` you can call `resetAccessToken` to reset
it, and a new `accessToken` will be returned, but you cannot retrieve the
current `accessToken`.

If a client with the same `clientId` already exists this operation will
fail. Use `updateClient` if you wish to update an existing client.

The caller's scopes must satisfy `scopes`.



Takes the following arguments:

  * `clientId`

Has required input schema

Has required output schema

```python
# Sync calls
auth.createClient(clientId, payload) # -> result
auth.createClient(payload, clientId='value') # -> result
# Async call
await asyncAuth.createClient(clientId, payload) # -> result
await asyncAuth.createClient(payload, clientId='value') # -> result
```

#### Reset `accessToken`
Reset a clients `accessToken`, this will revoke the existing
`accessToken`, generate a new `accessToken` and return it from this
call.

There is no way to retrieve an existing `accessToken`, so if you loose it
you must reset the accessToken to acquire it again.



Takes the following arguments:

  * `clientId`

Has required output schema

```python
# Sync calls
auth.resetAccessToken(clientId) # -> result
auth.resetAccessToken(clientId='value') # -> result
# Async call
await asyncAuth.resetAccessToken(clientId) # -> result
await asyncAuth.resetAccessToken(clientId='value') # -> result
```

#### Update Client
Update an exisiting client. The `clientId` and `accessToken` cannot be
updated, but `scopes` can be modified.  The caller's scopes must
satisfy all scopes being added to the client in the update operation.
If no scopes are given in the request, the client's scopes remain
unchanged



Takes the following arguments:

  * `clientId`

Has required input schema

Has required output schema

```python
# Sync calls
auth.updateClient(clientId, payload) # -> result
auth.updateClient(payload, clientId='value') # -> result
# Async call
await asyncAuth.updateClient(clientId, payload) # -> result
await asyncAuth.updateClient(payload, clientId='value') # -> result
```

#### Enable Client
Enable a client that was disabled with `disableClient`.  If the client
is already enabled, this does nothing.

This is typically used by identity providers to re-enable clients that
had been disabled when the corresponding identity's scopes changed.



Takes the following arguments:

  * `clientId`

Has required output schema

```python
# Sync calls
auth.enableClient(clientId) # -> result
auth.enableClient(clientId='value') # -> result
# Async call
await asyncAuth.enableClient(clientId) # -> result
await asyncAuth.enableClient(clientId='value') # -> result
```

#### Disable Client
Disable a client.  If the client is already disabled, this does nothing.

This is typically used by identity providers to disable clients when the
corresponding identity's scopes no longer satisfy the client's scopes.



Takes the following arguments:

  * `clientId`

Has required output schema

```python
# Sync calls
auth.disableClient(clientId) # -> result
auth.disableClient(clientId='value') # -> result
# Async call
await asyncAuth.disableClient(clientId) # -> result
await asyncAuth.disableClient(clientId='value') # -> result
```

#### Delete Client
Delete a client, please note that any roles related to this client must
be deleted independently.



Takes the following arguments:

  * `clientId`

```python
# Sync calls
auth.deleteClient(clientId) # -> None
auth.deleteClient(clientId='value') # -> None
# Async call
await asyncAuth.deleteClient(clientId) # -> None
await asyncAuth.deleteClient(clientId='value') # -> None
```

#### List Roles (no pagination)
Get a list of all roles. Each role object also includes the list of
scopes it expands to.  This always returns all roles in a single HTTP
request.

To get paginated results, use `listRoles2`.


Has required output schema

```python
# Sync calls
auth.listRoles() # -> result
# Async call
await asyncAuth.listRoles() # -> result
```

#### List Roles
Get a list of all roles. Each role object also includes the list of
scopes it expands to.  This is similar to `listRoles` but differs in the
format of the response.

If no limit is given, all roles are returned. Since this
list may become long, callers can use the `limit` and `continuationToken`
query arguments to page through the responses.


Has required output schema

```python
# Sync calls
auth.listRoles2() # -> result
# Async call
await asyncAuth.listRoles2() # -> result
```

#### List Role IDs
Get a list of all role IDs.

If no limit is given, the roleIds of all roles are returned. Since this
list may become long, callers can use the `limit` and `continuationToken`
query arguments to page through the responses.


Has required output schema

```python
# Sync calls
auth.listRoleIds() # -> result
# Async call
await asyncAuth.listRoleIds() # -> result
```

#### Get Role
Get information about a single role, including the set of scopes that the
role expands to.



Takes the following arguments:

  * `roleId`

Has required output schema

```python
# Sync calls
auth.role(roleId) # -> result
auth.role(roleId='value') # -> result
# Async call
await asyncAuth.role(roleId) # -> result
await asyncAuth.role(roleId='value') # -> result
```

#### Create Role
Create a new role.

The caller's scopes must satisfy the new role's scopes.

If there already exists a role with the same `roleId` this operation
will fail. Use `updateRole` to modify an existing role.

Creation of a role that will generate an infinite expansion will result
in an error response.



Takes the following arguments:

  * `roleId`

Has required input schema

Has required output schema

```python
# Sync calls
auth.createRole(roleId, payload) # -> result
auth.createRole(payload, roleId='value') # -> result
# Async call
await asyncAuth.createRole(roleId, payload) # -> result
await asyncAuth.createRole(payload, roleId='value') # -> result
```

#### Update Role
Update an existing role.

The caller's scopes must satisfy all of the new scopes being added, but
need not satisfy all of the role's existing scopes.

An update of a role that will generate an infinite expansion will result
in an error response.



Takes the following arguments:

  * `roleId`

Has required input schema

Has required output schema

```python
# Sync calls
auth.updateRole(roleId, payload) # -> result
auth.updateRole(payload, roleId='value') # -> result
# Async call
await asyncAuth.updateRole(roleId, payload) # -> result
await asyncAuth.updateRole(payload, roleId='value') # -> result
```

#### Delete Role
Delete a role. This operation will succeed regardless of whether or not
the role exists.



Takes the following arguments:

  * `roleId`

```python
# Sync calls
auth.deleteRole(roleId) # -> None
auth.deleteRole(roleId='value') # -> None
# Async call
await asyncAuth.deleteRole(roleId) # -> None
await asyncAuth.deleteRole(roleId='value') # -> None
```

#### Expand Scopes
Return an expanded copy of the given scopeset, with scopes implied by any
roles included.


Has required input schema

Has required output schema

```python
# Sync calls
auth.expandScopes(payload) # -> result
# Async call
await asyncAuth.expandScopes(payload) # -> result
```

#### Get Current Scopes
Return the expanded scopes available in the request, taking into account all sources
of scopes and scope restrictions (temporary credentials, assumeScopes, client scopes,
and roles).


Has required output schema

```python
# Sync calls
auth.currentScopes() # -> result
# Async call
await asyncAuth.currentScopes() # -> result
```

#### Get Temporary Read/Write Credentials S3
Get temporary AWS credentials for `read-write` or `read-only` access to
a given `bucket` and `prefix` within that bucket.
The `level` parameter can be `read-write` or `read-only` and determines
which type of credentials are returned. Please note that the `level`
parameter is required in the scope guarding access.  The bucket name must
not contain `.`, as recommended by Amazon.

This method can only allow access to a whitelisted set of buckets.  To add
a bucket to that whitelist, contact the Taskcluster team, who will add it to
the appropriate IAM policy.  If the bucket is in a different AWS account, you
will also need to add a bucket policy allowing access from the Taskcluster
account.  That policy should look like this:

```js
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "allow-taskcluster-auth-to-delegate-access",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::692406183521:root"
      },
      "Action": [
        "s3:ListBucket",
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:GetBucketLocation"
      ],
      "Resource": [
        "arn:aws:s3:::<bucket>",
        "arn:aws:s3:::<bucket>/*"
      ]
    }
  ]
}
```

The credentials are set to expire after an hour, but this behavior is
subject to change. Hence, you should always read the `expires` property
from the response, if you intend to maintain active credentials in your
application.

Please note that your `prefix` may not start with slash `/`. Such a prefix
is allowed on S3, but we forbid it here to discourage bad behavior.

Also note that if your `prefix` doesn't end in a slash `/`, the STS
credentials may allow access to unexpected keys, as S3 does not treat
slashes specially.  For example, a prefix of `my-folder` will allow
access to `my-folder/file.txt` as expected, but also to `my-folder.txt`,
which may not be intended.

Finally, note that the `PutObjectAcl` call is not allowed.  Passing a canned
ACL other than `private` to `PutObject` is treated as a `PutObjectAcl` call, and
will result in an access-denied error from AWS.  This limitation is due to a
security flaw in Amazon S3 which might otherwise allow indefinite access to
uploaded objects.

**EC2 metadata compatibility**, if the querystring parameter
`?format=iam-role-compat` is given, the response will be compatible
with the JSON exposed by the EC2 metadata service. This aims to ease
compatibility for libraries and tools built to auto-refresh credentials.
For details on the format returned by EC2 metadata service see:
[EC2 User Guide](http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/iam-roles-for-amazon-ec2.html#instance-metadata-security-credentials).



Takes the following arguments:

  * `level`
  * `bucket`
  * `prefix`

Has required output schema

```python
# Sync calls
auth.awsS3Credentials(level, bucket, prefix) # -> result
auth.awsS3Credentials(level='value', bucket='value', prefix='value') # -> result
# Async call
await asyncAuth.awsS3Credentials(level, bucket, prefix) # -> result
await asyncAuth.awsS3Credentials(level='value', bucket='value', prefix='value') # -> result
```

#### List Accounts Managed by Auth
Retrieve a list of all Azure accounts managed by Taskcluster Auth.


Has required output schema

```python
# Sync calls
auth.azureAccounts() # -> result
# Async call
await asyncAuth.azureAccounts() # -> result
```

#### List Tables in an Account Managed by Auth
Retrieve a list of all tables in an account.



Takes the following arguments:

  * `account`

Has required output schema

```python
# Sync calls
auth.azureTables(account) # -> result
auth.azureTables(account='value') # -> result
# Async call
await asyncAuth.azureTables(account) # -> result
await asyncAuth.azureTables(account='value') # -> result
```

#### Get Shared-Access-Signature for Azure Table
Get a shared access signature (SAS) string for use with a specific Azure
Table Storage table.

The `level` parameter can be `read-write` or `read-only` and determines
which type of credentials are returned.  If level is read-write, it will create the
table if it doesn't already exist.



Takes the following arguments:

  * `account`
  * `table`
  * `level`

Has required output schema

```python
# Sync calls
auth.azureTableSAS(account, table, level) # -> result
auth.azureTableSAS(account='value', table='value', level='value') # -> result
# Async call
await asyncAuth.azureTableSAS(account, table, level) # -> result
await asyncAuth.azureTableSAS(account='value', table='value', level='value') # -> result
```

#### List containers in an Account Managed by Auth
Retrieve a list of all containers in an account.



Takes the following arguments:

  * `account`

Has required output schema

```python
# Sync calls
auth.azureContainers(account) # -> result
auth.azureContainers(account='value') # -> result
# Async call
await asyncAuth.azureContainers(account) # -> result
await asyncAuth.azureContainers(account='value') # -> result
```

#### Get Shared-Access-Signature for Azure Container
Get a shared access signature (SAS) string for use with a specific Azure
Blob Storage container.

The `level` parameter can be `read-write` or `read-only` and determines
which type of credentials are returned.  If level is read-write, it will create the
container if it doesn't already exist.



Takes the following arguments:

  * `account`
  * `container`
  * `level`

Has required output schema

```python
# Sync calls
auth.azureContainerSAS(account, container, level) # -> result
auth.azureContainerSAS(account='value', container='value', level='value') # -> result
# Async call
await asyncAuth.azureContainerSAS(account, container, level) # -> result
await asyncAuth.azureContainerSAS(account='value', container='value', level='value') # -> result
```

#### Get DSN for Sentry Project
Get temporary DSN (access credentials) for a sentry project.
The credentials returned can be used with any Sentry client for up to
24 hours, after which the credentials will be automatically disabled.

If the project doesn't exist it will be created, and assigned to the
initial team configured for this component. Contact a Sentry admin
to have the project transferred to a team you have access to if needed



Takes the following arguments:

  * `project`

Has required output schema

```python
# Sync calls
auth.sentryDSN(project) # -> result
auth.sentryDSN(project='value') # -> result
# Async call
await asyncAuth.sentryDSN(project) # -> result
await asyncAuth.sentryDSN(project='value') # -> result
```

#### Get Token for Statsum Project
Get temporary `token` and `baseUrl` for sending metrics to statsum.

The token is valid for 24 hours, clients should refresh after expiration.



Takes the following arguments:

  * `project`

Has required output schema

```python
# Sync calls
auth.statsumToken(project) # -> result
auth.statsumToken(project='value') # -> result
# Async call
await asyncAuth.statsumToken(project) # -> result
await asyncAuth.statsumToken(project='value') # -> result
```

#### Get a client token for the Websocktunnel service
Get a temporary token suitable for use connecting to a
[websocktunnel](https://github.com/taskcluster/websocktunnel) server.

The resulting token will only be accepted by servers with a matching audience
value.  Reaching such a server is the callers responsibility.  In general,
a server URL or set of URLs should be provided to the caller as configuration
along with the audience value.

The token is valid for a limited time (on the scale of hours). Callers should
refresh it before expiration.



Takes the following arguments:

  * `wstAudience`
  * `wstClient`

Has required output schema

```python
# Sync calls
auth.websocktunnelToken(wstAudience, wstClient) # -> result
auth.websocktunnelToken(wstAudience='value', wstClient='value') # -> result
# Async call
await asyncAuth.websocktunnelToken(wstAudience, wstClient) # -> result
await asyncAuth.websocktunnelToken(wstAudience='value', wstClient='value') # -> result
```

#### Get Temporary GCP Credentials
Get temporary GCP credentials for the given serviceAccount in the given project.

Only preconfigured projects are allowed.  Any serviceAccount in that project may
be used.

The call adds the necessary policy if the serviceAccount doesn't have it.
The credentials are set to expire after an hour, but this behavior is
subject to change. Hence, you should always read the `expires` property
from the response, if you intend to maintain active credentials in your
application.



Takes the following arguments:

  * `projectId`
  * `serviceAccount`

Has required output schema

```python
# Sync calls
auth.gcpCredentials(projectId, serviceAccount) # -> result
auth.gcpCredentials(projectId='value', serviceAccount='value') # -> result
# Async call
await asyncAuth.gcpCredentials(projectId, serviceAccount) # -> result
await asyncAuth.gcpCredentials(projectId='value', serviceAccount='value') # -> result
```

#### Authenticate Hawk Request
Validate the request signature given on input and return list of scopes
that the authenticating client has.

This method is used by other services that wish rely on Taskcluster
credentials for authentication. This way we can use Hawk without having
the secret credentials leave this service.


Has required input schema

Has required output schema

```python
# Sync calls
auth.authenticateHawk(payload) # -> result
# Async call
await asyncAuth.authenticateHawk(payload) # -> result
```

#### Test Authentication
Utility method to test client implementations of Taskcluster
authentication.

Rather than using real credentials, this endpoint accepts requests with
clientId `tester` and accessToken `no-secret`. That client's scopes are
based on `clientScopes` in the request body.

The request is validated, with any certificate, authorizedScopes, etc.
applied, and the resulting scopes are checked against `requiredScopes`
from the request body. On success, the response contains the clientId
and scopes as seen by the API method.


Has required input schema

Has required output schema

```python
# Sync calls
auth.testAuthenticate(payload) # -> result
# Async call
await asyncAuth.testAuthenticate(payload) # -> result
```

#### Test Authentication (GET)
Utility method similar to `testAuthenticate`, but with the GET method,
so it can be used with signed URLs (bewits).

Rather than using real credentials, this endpoint accepts requests with
clientId `tester` and accessToken `no-secret`. That client's scopes are
`['test:*', 'auth:create-client:test:*']`.  The call fails if the 
`test:authenticate-get` scope is not available.

The request is validated, with any certificate, authorizedScopes, etc.
applied, and the resulting scopes are checked, just like any API call.
On success, the response contains the clientId and scopes as seen by
the API method.

This method may later be extended to allow specification of client and
required scopes via query arguments.


Has required output schema

```python
# Sync calls
auth.testAuthenticateGet() # -> result
# Async call
await asyncAuth.testAuthenticateGet() # -> result
```




### Exchanges in `taskcluster.AuthEvents`
```python
import taskcluster

# Create AuthEvents client instance
authEvents = taskcluster.AuthEvents(options)
```
The auth service is responsible for storing credentials, managing
assignment of scopes, and validation of request signatures from other
services.

These exchanges provides notifications when credentials or roles are
updated. This is mostly so that multiple instances of the auth service
can purge their caches and synchronize state. But you are of course
welcome to use these for other purposes, monitoring changes for example.
#### Client Created Messages
 * `authEvents.clientCreated(routingKeyPattern) -> routingKey`
   * `reserved` Description: Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.

#### Client Updated Messages
 * `authEvents.clientUpdated(routingKeyPattern) -> routingKey`
   * `reserved` Description: Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.

#### Client Deleted Messages
 * `authEvents.clientDeleted(routingKeyPattern) -> routingKey`
   * `reserved` Description: Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.

#### Role Created Messages
 * `authEvents.roleCreated(routingKeyPattern) -> routingKey`
   * `reserved` Description: Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.

#### Role Updated Messages
 * `authEvents.roleUpdated(routingKeyPattern) -> routingKey`
   * `reserved` Description: Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.

#### Role Deleted Messages
 * `authEvents.roleDeleted(routingKeyPattern) -> routingKey`
   * `reserved` Description: Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.




### Methods in `taskcluster.AwsProvisioner`
```python
import asyncio # Only for async 
import taskcluster
import taskcluster.aio

# Create AwsProvisioner client instance
awsProvisioner = taskcluster.AwsProvisioner(options)
# Below only for async instances, assume already in coroutine
loop = asyncio.get_event_loop()
session = taskcluster.aio.createSession(loop=loop)
asyncAwsProvisioner = taskcluster.aio.AwsProvisioner(options, session=session)
```
The AWS Provisioner is responsible for provisioning instances on EC2 for use in
Taskcluster.  The provisioner maintains a set of worker configurations which
can be managed with an API that is typically available at
aws-provisioner.taskcluster.net/v1.  This API can also perform basic instance
management tasks in addition to maintaining the internal state of worker type
configuration information.

The Provisioner runs at a configurable interval.  Each iteration of the
provisioner fetches a current copy the state that the AWS EC2 api reports.  In
each iteration, we ask the Queue how many tasks are pending for that worker
type.  Based on the number of tasks pending and the scaling ratio, we may
submit requests for new instances.  We use pricing information, capacity and
utility factor information to decide which instance type in which region would
be the optimal configuration.

Each EC2 instance type will declare a capacity and utility factor.  Capacity is
the number of tasks that a given machine is capable of running concurrently.
Utility factor is a relative measure of performance between two instance types.
We multiply the utility factor by the spot price to compare instance types and
regions when making the bidding choices.

When a new EC2 instance is instantiated, its user data contains a token in
`securityToken` that can be used with the `getSecret` method to retrieve
the worker's credentials and any needed passwords or other restricted
information.  The worker is responsible for deleting the secret after
retrieving it, to prevent dissemination of the secret to other proceses
which can read the instance user data.

#### List worker types with details
Return a list of worker types, including some summary information about
current capacity for each.  While this list includes all defined worker types,
there may be running EC2 instances for deleted worker types that are not
included here.  The list is unordered.


Has required output schema

```python
# Sync calls
awsProvisioner.listWorkerTypeSummaries() # -> result
# Async call
await asyncAwsProvisioner.listWorkerTypeSummaries() # -> result
```

#### Create new Worker Type
Create a worker type.  A worker type contains all the configuration
needed for the provisioner to manage the instances.  Each worker type
knows which regions and which instance types are allowed for that
worker type.  Remember that Capacity is the number of concurrent tasks
that can be run on a given EC2 resource and that Utility is the relative
performance rate between different instance types.  There is no way to
configure different regions to have different sets of instance types
so ensure that all instance types are available in all regions.
This function is idempotent.

Once a worker type is in the provisioner, a back ground process will
begin creating instances for it based on its capacity bounds and its
pending task count from the Queue.  It is the worker's responsibility
to shut itself down.  The provisioner has a limit (currently 96hours)
for all instances to prevent zombie instances from running indefinitely.

The provisioner will ensure that all instances created are tagged with
aws resource tags containing the provisioner id and the worker type.

If provided, the secrets in the global, region and instance type sections
are available using the secrets api.  If specified, the scopes provided
will be used to generate a set of temporary credentials available with
the other secrets.



Takes the following arguments:

  * `workerType`

Has required input schema

Has required output schema

```python
# Sync calls
awsProvisioner.createWorkerType(workerType, payload) # -> result
awsProvisioner.createWorkerType(payload, workerType='value') # -> result
# Async call
await asyncAwsProvisioner.createWorkerType(workerType, payload) # -> result
await asyncAwsProvisioner.createWorkerType(payload, workerType='value') # -> result
```

#### Update Worker Type
Provide a new copy of a worker type to replace the existing one.
This will overwrite the existing worker type definition if there
is already a worker type of that name.  This method will return a
200 response along with a copy of the worker type definition created
Note that if you are using the result of a GET on the worker-type
end point that you will need to delete the lastModified and workerType
keys from the object returned, since those fields are not allowed
the request body for this method

Otherwise, all input requirements and actions are the same as the
create method.



Takes the following arguments:

  * `workerType`

Has required input schema

Has required output schema

```python
# Sync calls
awsProvisioner.updateWorkerType(workerType, payload) # -> result
awsProvisioner.updateWorkerType(payload, workerType='value') # -> result
# Async call
await asyncAwsProvisioner.updateWorkerType(workerType, payload) # -> result
await asyncAwsProvisioner.updateWorkerType(payload, workerType='value') # -> result
```

#### Get Worker Type Last Modified Time
This method is provided to allow workers to see when they were
last modified.  The value provided through UserData can be
compared against this value to see if changes have been made
If the worker type definition has not been changed, the date
should be identical as it is the same stored value.



Takes the following arguments:

  * `workerType`

Has required output schema

```python
# Sync calls
awsProvisioner.workerTypeLastModified(workerType) # -> result
awsProvisioner.workerTypeLastModified(workerType='value') # -> result
# Async call
await asyncAwsProvisioner.workerTypeLastModified(workerType) # -> result
await asyncAwsProvisioner.workerTypeLastModified(workerType='value') # -> result
```

#### Get Worker Type
Retrieve a copy of the requested worker type definition.
This copy contains a lastModified field as well as the worker
type name.  As such, it will require manipulation to be able to
use the results of this method to submit date to the update
method.



Takes the following arguments:

  * `workerType`

Has required output schema

```python
# Sync calls
awsProvisioner.workerType(workerType) # -> result
awsProvisioner.workerType(workerType='value') # -> result
# Async call
await asyncAwsProvisioner.workerType(workerType) # -> result
await asyncAwsProvisioner.workerType(workerType='value') # -> result
```

#### Delete Worker Type
Delete a worker type definition.  This method will only delete
the worker type definition from the storage table.  The actual
deletion will be handled by a background worker.  As soon as this
method is called for a worker type, the background worker will
immediately submit requests to cancel all spot requests for this
worker type as well as killing all instances regardless of their
state.  If you want to gracefully remove a worker type, you must
either ensure that no tasks are created with that worker type name
or you could theoretically set maxCapacity to 0, though, this is
not a supported or tested action



Takes the following arguments:

  * `workerType`

```python
# Sync calls
awsProvisioner.removeWorkerType(workerType) # -> None
awsProvisioner.removeWorkerType(workerType='value') # -> None
# Async call
await asyncAwsProvisioner.removeWorkerType(workerType) # -> None
await asyncAwsProvisioner.removeWorkerType(workerType='value') # -> None
```

#### List Worker Types
Return a list of string worker type names.  These are the names
of all managed worker types known to the provisioner.  This does
not include worker types which are left overs from a deleted worker
type definition but are still running in AWS.


Has required output schema

```python
# Sync calls
awsProvisioner.listWorkerTypes() # -> result
# Async call
await asyncAwsProvisioner.listWorkerTypes() # -> result
```

#### Create new Secret
Insert a secret into the secret storage.  The supplied secrets will
be provided verbatime via `getSecret`, while the supplied scopes will
be converted into credentials by `getSecret`.

This method is not ordinarily used in production; instead, the provisioner
creates a new secret directly for each spot bid.



Takes the following arguments:

  * `token`

Has required input schema

```python
# Sync calls
awsProvisioner.createSecret(token, payload) # -> None
awsProvisioner.createSecret(payload, token='value') # -> None
# Async call
await asyncAwsProvisioner.createSecret(token, payload) # -> None
await asyncAwsProvisioner.createSecret(payload, token='value') # -> None
```

#### Get a Secret
Retrieve a secret from storage.  The result contains any passwords or
other restricted information verbatim as well as a temporary credential
based on the scopes specified when the secret was created.

It is important that this secret is deleted by the consumer (`removeSecret`),
or else the secrets will be visible to any process which can access the
user data associated with the instance.



Takes the following arguments:

  * `token`

Has required output schema

```python
# Sync calls
awsProvisioner.getSecret(token) # -> result
awsProvisioner.getSecret(token='value') # -> result
# Async call
await asyncAwsProvisioner.getSecret(token) # -> result
await asyncAwsProvisioner.getSecret(token='value') # -> result
```

#### Report an instance starting
An instance will report in by giving its instance id as well
as its security token.  The token is given and checked to ensure
that it matches a real token that exists to ensure that random
machines do not check in.  We could generate a different token
but that seems like overkill



Takes the following arguments:

  * `instanceId`
  * `token`

```python
# Sync calls
awsProvisioner.instanceStarted(instanceId, token) # -> None
awsProvisioner.instanceStarted(instanceId='value', token='value') # -> None
# Async call
await asyncAwsProvisioner.instanceStarted(instanceId, token) # -> None
await asyncAwsProvisioner.instanceStarted(instanceId='value', token='value') # -> None
```

#### Remove a Secret
Remove a secret.  After this call, a call to `getSecret` with the given
token will return no information.

It is very important that the consumer of a 
secret delete the secret from storage before handing over control
to untrusted processes to prevent credential and/or secret leakage.



Takes the following arguments:

  * `token`

```python
# Sync calls
awsProvisioner.removeSecret(token) # -> None
awsProvisioner.removeSecret(token='value') # -> None
# Async call
await asyncAwsProvisioner.removeSecret(token) # -> None
await asyncAwsProvisioner.removeSecret(token='value') # -> None
```

#### Get All Launch Specifications for WorkerType
This method returns a preview of all possible launch specifications
that this worker type definition could submit to EC2.  It is used to
test worker types, nothing more

**This API end-point is experimental and may be subject to change without warning.**



Takes the following arguments:

  * `workerType`

Has required output schema

```python
# Sync calls
awsProvisioner.getLaunchSpecs(workerType) # -> result
awsProvisioner.getLaunchSpecs(workerType='value') # -> result
# Async call
await asyncAwsProvisioner.getLaunchSpecs(workerType) # -> result
await asyncAwsProvisioner.getLaunchSpecs(workerType='value') # -> result
```

#### Get AWS State for a worker type
Return the state of a given workertype as stored by the provisioner. 
This state is stored as three lists: 1 for running instances, 1 for
pending requests.  The `summary` property contains an updated summary
similar to that returned from `listWorkerTypeSummaries`.



Takes the following arguments:

  * `workerType`

```python
# Sync calls
awsProvisioner.state(workerType) # -> None
awsProvisioner.state(workerType='value') # -> None
# Async call
await asyncAwsProvisioner.state(workerType) # -> None
await asyncAwsProvisioner.state(workerType='value') # -> None
```

#### Backend Status
This endpoint is used to show when the last time the provisioner
has checked in.  A check in is done through the deadman's snitch
api.  It is done at the conclusion of a provisioning iteration
and used to tell if the background provisioning process is still
running.

**Warning** this api end-point is **not stable**.


Has required output schema

```python
# Sync calls
awsProvisioner.backendStatus() # -> result
# Async call
await asyncAwsProvisioner.backendStatus() # -> result
```

#### Ping Server
Respond without doing anything.
This endpoint is used to check that the service is up.


```python
# Sync calls
awsProvisioner.ping() # -> None
# Async call
await asyncAwsProvisioner.ping() # -> None
```




### Methods in `taskcluster.EC2Manager`
```python
import asyncio # Only for async 
import taskcluster
import taskcluster.aio

# Create EC2Manager client instance
eC2Manager = taskcluster.EC2Manager(options)
# Below only for async instances, assume already in coroutine
loop = asyncio.get_event_loop()
session = taskcluster.aio.createSession(loop=loop)
asyncEC2Manager = taskcluster.aio.EC2Manager(options, session=session)
```
A taskcluster service which manages EC2 instances.  This service does not understand any taskcluster concepts intrinsicaly other than using the name `workerType` to refer to a group of associated instances.  Unless you are working on building a provisioner for AWS, you almost certainly do not want to use this service
#### Ping Server
Respond without doing anything.
This endpoint is used to check that the service is up.


```python
# Sync calls
eC2Manager.ping() # -> None
# Async call
await asyncEC2Manager.ping() # -> None
```

#### See the list of worker types which are known to be managed
This method is only for debugging the ec2-manager


Has required output schema

```python
# Sync calls
eC2Manager.listWorkerTypes() # -> result
# Async call
await asyncEC2Manager.listWorkerTypes() # -> result
```

#### Run an instance
Request an instance of a worker type



Takes the following arguments:

  * `workerType`

Has required input schema

```python
# Sync calls
eC2Manager.runInstance(workerType, payload) # -> None
eC2Manager.runInstance(payload, workerType='value') # -> None
# Async call
await asyncEC2Manager.runInstance(workerType, payload) # -> None
await asyncEC2Manager.runInstance(payload, workerType='value') # -> None
```

#### Terminate all resources from a worker type
Terminate all instances for this worker type



Takes the following arguments:

  * `workerType`

```python
# Sync calls
eC2Manager.terminateWorkerType(workerType) # -> None
eC2Manager.terminateWorkerType(workerType='value') # -> None
# Async call
await asyncEC2Manager.terminateWorkerType(workerType) # -> None
await asyncEC2Manager.terminateWorkerType(workerType='value') # -> None
```

#### Look up the resource stats for a workerType
Return an object which has a generic state description. This only contains counts of instances



Takes the following arguments:

  * `workerType`

Has required output schema

```python
# Sync calls
eC2Manager.workerTypeStats(workerType) # -> result
eC2Manager.workerTypeStats(workerType='value') # -> result
# Async call
await asyncEC2Manager.workerTypeStats(workerType) # -> result
await asyncEC2Manager.workerTypeStats(workerType='value') # -> result
```

#### Look up the resource health for a workerType
Return a view of the health of a given worker type



Takes the following arguments:

  * `workerType`

Has required output schema

```python
# Sync calls
eC2Manager.workerTypeHealth(workerType) # -> result
eC2Manager.workerTypeHealth(workerType='value') # -> result
# Async call
await asyncEC2Manager.workerTypeHealth(workerType) # -> result
await asyncEC2Manager.workerTypeHealth(workerType='value') # -> result
```

#### Look up the most recent errors of a workerType
Return a list of the most recent errors encountered by a worker type



Takes the following arguments:

  * `workerType`

Has required output schema

```python
# Sync calls
eC2Manager.workerTypeErrors(workerType) # -> result
eC2Manager.workerTypeErrors(workerType='value') # -> result
# Async call
await asyncEC2Manager.workerTypeErrors(workerType) # -> result
await asyncEC2Manager.workerTypeErrors(workerType='value') # -> result
```

#### Look up the resource state for a workerType
Return state information for a given worker type



Takes the following arguments:

  * `workerType`

Has required output schema

```python
# Sync calls
eC2Manager.workerTypeState(workerType) # -> result
eC2Manager.workerTypeState(workerType='value') # -> result
# Async call
await asyncEC2Manager.workerTypeState(workerType) # -> result
await asyncEC2Manager.workerTypeState(workerType='value') # -> result
```

#### Ensure a KeyPair for a given worker type exists
Idempotently ensure that a keypair of a given name exists



Takes the following arguments:

  * `name`

Has required input schema

```python
# Sync calls
eC2Manager.ensureKeyPair(name, payload) # -> None
eC2Manager.ensureKeyPair(payload, name='value') # -> None
# Async call
await asyncEC2Manager.ensureKeyPair(name, payload) # -> None
await asyncEC2Manager.ensureKeyPair(payload, name='value') # -> None
```

#### Ensure a KeyPair for a given worker type does not exist
Ensure that a keypair of a given name does not exist.



Takes the following arguments:

  * `name`

```python
# Sync calls
eC2Manager.removeKeyPair(name) # -> None
eC2Manager.removeKeyPair(name='value') # -> None
# Async call
await asyncEC2Manager.removeKeyPair(name) # -> None
await asyncEC2Manager.removeKeyPair(name='value') # -> None
```

#### Terminate an instance
Terminate an instance in a specified region



Takes the following arguments:

  * `region`
  * `instanceId`

```python
# Sync calls
eC2Manager.terminateInstance(region, instanceId) # -> None
eC2Manager.terminateInstance(region='value', instanceId='value') # -> None
# Async call
await asyncEC2Manager.terminateInstance(region, instanceId) # -> None
await asyncEC2Manager.terminateInstance(region='value', instanceId='value') # -> None
```

#### Request prices for EC2
Return a list of possible prices for EC2


Has required output schema

```python
# Sync calls
eC2Manager.getPrices() # -> result
# Async call
await asyncEC2Manager.getPrices() # -> result
```

#### Request prices for EC2
Return a list of possible prices for EC2


Has required input schema

Has required output schema

```python
# Sync calls
eC2Manager.getSpecificPrices(payload) # -> result
# Async call
await asyncEC2Manager.getSpecificPrices(payload) # -> result
```

#### Get EC2 account health metrics
Give some basic stats on the health of our EC2 account


Has required output schema

```python
# Sync calls
eC2Manager.getHealth() # -> result
# Async call
await asyncEC2Manager.getHealth() # -> result
```

#### Look up the most recent errors in the provisioner across all worker types
Return a list of recent errors encountered


Has required output schema

```python
# Sync calls
eC2Manager.getRecentErrors() # -> result
# Async call
await asyncEC2Manager.getRecentErrors() # -> result
```

#### See the list of regions managed by this ec2-manager
This method is only for debugging the ec2-manager


```python
# Sync calls
eC2Manager.regions() # -> None
# Async call
await asyncEC2Manager.regions() # -> None
```

#### See the list of AMIs and their usage
List AMIs and their usage by returning a list of objects in the form:
{
region: string
  volumetype: string
  lastused: timestamp
}


```python
# Sync calls
eC2Manager.amiUsage() # -> None
# Async call
await asyncEC2Manager.amiUsage() # -> None
```

#### See the current EBS volume usage list
Lists current EBS volume usage by returning a list of objects
that are uniquely defined by {region, volumetype, state} in the form:
{
region: string,
  volumetype: string,
  state: string,
  totalcount: integer,
  totalgb: integer,
  touched: timestamp (last time that information was updated),
}


```python
# Sync calls
eC2Manager.ebsUsage() # -> None
# Async call
await asyncEC2Manager.ebsUsage() # -> None
```

#### Statistics on the Database client pool
This method is only for debugging the ec2-manager


```python
# Sync calls
eC2Manager.dbpoolStats() # -> None
# Async call
await asyncEC2Manager.dbpoolStats() # -> None
```

#### List out the entire internal state
This method is only for debugging the ec2-manager


```python
# Sync calls
eC2Manager.allState() # -> None
# Async call
await asyncEC2Manager.allState() # -> None
```

#### Statistics on the sqs queues
This method is only for debugging the ec2-manager


```python
# Sync calls
eC2Manager.sqsStats() # -> None
# Async call
await asyncEC2Manager.sqsStats() # -> None
```

#### Purge the SQS queues
This method is only for debugging the ec2-manager


```python
# Sync calls
eC2Manager.purgeQueues() # -> None
# Async call
await asyncEC2Manager.purgeQueues() # -> None
```




### Methods in `taskcluster.Github`
```python
import asyncio # Only for async 
import taskcluster
import taskcluster.aio

# Create Github client instance
github = taskcluster.Github(options)
# Below only for async instances, assume already in coroutine
loop = asyncio.get_event_loop()
session = taskcluster.aio.createSession(loop=loop)
asyncGithub = taskcluster.aio.Github(options, session=session)
```
The github service is responsible for creating tasks in reposnse
to GitHub events, and posting results to the GitHub UI.

This document describes the API end-point for consuming GitHub
web hooks, as well as some useful consumer APIs.

When Github forbids an action, this service returns an HTTP 403
with code ForbiddenByGithub.
#### Ping Server
Respond without doing anything.
This endpoint is used to check that the service is up.


```python
# Sync calls
github.ping() # -> None
# Async call
await asyncGithub.ping() # -> None
```

#### Consume GitHub WebHook
Capture a GitHub event and publish it via pulse, if it's a push,
release or pull request.


```python
# Sync calls
github.githubWebHookConsumer() # -> None
# Async call
await asyncGithub.githubWebHookConsumer() # -> None
```

#### List of Builds
A paginated list of builds that have been run in
Taskcluster. Can be filtered on various git-specific
fields.


Has required output schema

```python
# Sync calls
github.builds() # -> result
# Async call
await asyncGithub.builds() # -> result
```

#### Latest Build Status Badge
Checks the status of the latest build of a given branch
and returns corresponding badge svg.



Takes the following arguments:

  * `owner`
  * `repo`
  * `branch`

```python
# Sync calls
github.badge(owner, repo, branch) # -> None
github.badge(owner='value', repo='value', branch='value') # -> None
# Async call
await asyncGithub.badge(owner, repo, branch) # -> None
await asyncGithub.badge(owner='value', repo='value', branch='value') # -> None
```

#### Get Repository Info
Returns any repository metadata that is
useful within Taskcluster related services.



Takes the following arguments:

  * `owner`
  * `repo`

Has required output schema

```python
# Sync calls
github.repository(owner, repo) # -> result
github.repository(owner='value', repo='value') # -> result
# Async call
await asyncGithub.repository(owner, repo) # -> result
await asyncGithub.repository(owner='value', repo='value') # -> result
```

#### Latest Status for Branch
For a given branch of a repository, this will always point
to a status page for the most recent task triggered by that
branch.

Note: This is a redirect rather than a direct link.



Takes the following arguments:

  * `owner`
  * `repo`
  * `branch`

```python
# Sync calls
github.latest(owner, repo, branch) # -> None
github.latest(owner='value', repo='value', branch='value') # -> None
# Async call
await asyncGithub.latest(owner, repo, branch) # -> None
await asyncGithub.latest(owner='value', repo='value', branch='value') # -> None
```

#### Post a status against a given changeset
For a given changeset (SHA) of a repository, this will attach a "commit status"
on github. These statuses are links displayed next to each revision.
The status is either OK (green check) or FAILURE (red cross), 
made of a custom title and link.



Takes the following arguments:

  * `owner`
  * `repo`
  * `sha`

Has required input schema

```python
# Sync calls
github.createStatus(owner, repo, sha, payload) # -> None
github.createStatus(payload, owner='value', repo='value', sha='value') # -> None
# Async call
await asyncGithub.createStatus(owner, repo, sha, payload) # -> None
await asyncGithub.createStatus(payload, owner='value', repo='value', sha='value') # -> None
```

#### Post a comment on a given GitHub Issue or Pull Request
For a given Issue or Pull Request of a repository, this will write a new message.



Takes the following arguments:

  * `owner`
  * `repo`
  * `number`

Has required input schema

```python
# Sync calls
github.createComment(owner, repo, number, payload) # -> None
github.createComment(payload, owner='value', repo='value', number='value') # -> None
# Async call
await asyncGithub.createComment(owner, repo, number, payload) # -> None
await asyncGithub.createComment(payload, owner='value', repo='value', number='value') # -> None
```




### Exchanges in `taskcluster.GithubEvents`
```python
import taskcluster

# Create GithubEvents client instance
githubEvents = taskcluster.GithubEvents(options)
```
The github service publishes a pulse
message for supported github events, translating Github webhook
events into pulse messages.

This document describes the exchange offered by the taskcluster
github service
#### GitHub Pull Request Event
 * `githubEvents.pullRequest(routingKeyPattern) -> routingKey`
   * `routingKeyKind` is constant of `primary`  is required  Description: Identifier for the routing-key kind. This is always `"primary"` for the formalized routing key.
   * `organization` is required  Description: The GitHub `organization` which had an event. All periods have been replaced by % - such that foo.bar becomes foo%bar - and all other special characters aside from - and _ have been stripped.
   * `repository` is required  Description: The GitHub `repository` which had an event.All periods have been replaced by % - such that foo.bar becomes foo%bar - and all other special characters aside from - and _ have been stripped.
   * `action` is required  Description: The GitHub `action` which triggered an event. See for possible values see the payload actions property.

#### GitHub push Event
 * `githubEvents.push(routingKeyPattern) -> routingKey`
   * `routingKeyKind` is constant of `primary`  is required  Description: Identifier for the routing-key kind. This is always `"primary"` for the formalized routing key.
   * `organization` is required  Description: The GitHub `organization` which had an event. All periods have been replaced by % - such that foo.bar becomes foo%bar - and all other special characters aside from - and _ have been stripped.
   * `repository` is required  Description: The GitHub `repository` which had an event.All periods have been replaced by % - such that foo.bar becomes foo%bar - and all other special characters aside from - and _ have been stripped.

#### GitHub release Event
 * `githubEvents.release(routingKeyPattern) -> routingKey`
   * `routingKeyKind` is constant of `primary`  is required  Description: Identifier for the routing-key kind. This is always `"primary"` for the formalized routing key.
   * `organization` is required  Description: The GitHub `organization` which had an event. All periods have been replaced by % - such that foo.bar becomes foo%bar - and all other special characters aside from - and _ have been stripped.
   * `repository` is required  Description: The GitHub `repository` which had an event.All periods have been replaced by % - such that foo.bar becomes foo%bar - and all other special characters aside from - and _ have been stripped.

#### tc-gh requested the Queue service to create all the tasks in a group
 * `githubEvents.taskGroupCreationRequested(routingKeyPattern) -> routingKey`
   * `routingKeyKind` is constant of `primary`  is required  Description: Identifier for the routing-key kind. This is always `"primary"` for the formalized routing key.
   * `organization` is required  Description: The GitHub `organization` which had an event. All periods have been replaced by % - such that foo.bar becomes foo%bar - and all other special characters aside from - and _ have been stripped.
   * `repository` is required  Description: The GitHub `repository` which had an event.All periods have been replaced by % - such that foo.bar becomes foo%bar - and all other special characters aside from - and _ have been stripped.




### Methods in `taskcluster.Hooks`
```python
import asyncio # Only for async 
import taskcluster
import taskcluster.aio

# Create Hooks client instance
hooks = taskcluster.Hooks(options)
# Below only for async instances, assume already in coroutine
loop = asyncio.get_event_loop()
session = taskcluster.aio.createSession(loop=loop)
asyncHooks = taskcluster.aio.Hooks(options, session=session)
```
The hooks service provides a mechanism for creating tasks in response to events.

#### Ping Server
Respond without doing anything.
This endpoint is used to check that the service is up.


```python
# Sync calls
hooks.ping() # -> None
# Async call
await asyncHooks.ping() # -> None
```

#### List hook groups
This endpoint will return a list of all hook groups with at least one hook.


Has required output schema

```python
# Sync calls
hooks.listHookGroups() # -> result
# Async call
await asyncHooks.listHookGroups() # -> result
```

#### List hooks in a given group
This endpoint will return a list of all the hook definitions within a
given hook group.



Takes the following arguments:

  * `hookGroupId`

Has required output schema

```python
# Sync calls
hooks.listHooks(hookGroupId) # -> result
hooks.listHooks(hookGroupId='value') # -> result
# Async call
await asyncHooks.listHooks(hookGroupId) # -> result
await asyncHooks.listHooks(hookGroupId='value') # -> result
```

#### Get hook definition
This endpoint will return the hook definition for the given `hookGroupId`
and hookId.



Takes the following arguments:

  * `hookGroupId`
  * `hookId`

Has required output schema

```python
# Sync calls
hooks.hook(hookGroupId, hookId) # -> result
hooks.hook(hookGroupId='value', hookId='value') # -> result
# Async call
await asyncHooks.hook(hookGroupId, hookId) # -> result
await asyncHooks.hook(hookGroupId='value', hookId='value') # -> result
```

#### Get hook status
This endpoint will return the current status of the hook.  This represents a
snapshot in time and may vary from one call to the next.

This method is deprecated in favor of listLastFires.



Takes the following arguments:

  * `hookGroupId`
  * `hookId`

Has required output schema

```python
# Sync calls
hooks.getHookStatus(hookGroupId, hookId) # -> result
hooks.getHookStatus(hookGroupId='value', hookId='value') # -> result
# Async call
await asyncHooks.getHookStatus(hookGroupId, hookId) # -> result
await asyncHooks.getHookStatus(hookGroupId='value', hookId='value') # -> result
```

#### Create a hook
This endpoint will create a new hook.

The caller's credentials must include the role that will be used to
create the task.  That role must satisfy task.scopes as well as the
necessary scopes to add the task to the queue.



Takes the following arguments:

  * `hookGroupId`
  * `hookId`

Has required input schema

Has required output schema

```python
# Sync calls
hooks.createHook(hookGroupId, hookId, payload) # -> result
hooks.createHook(payload, hookGroupId='value', hookId='value') # -> result
# Async call
await asyncHooks.createHook(hookGroupId, hookId, payload) # -> result
await asyncHooks.createHook(payload, hookGroupId='value', hookId='value') # -> result
```

#### Update a hook
This endpoint will update an existing hook.  All fields except
`hookGroupId` and `hookId` can be modified.



Takes the following arguments:

  * `hookGroupId`
  * `hookId`

Has required input schema

Has required output schema

```python
# Sync calls
hooks.updateHook(hookGroupId, hookId, payload) # -> result
hooks.updateHook(payload, hookGroupId='value', hookId='value') # -> result
# Async call
await asyncHooks.updateHook(hookGroupId, hookId, payload) # -> result
await asyncHooks.updateHook(payload, hookGroupId='value', hookId='value') # -> result
```

#### Delete a hook
This endpoint will remove a hook definition.



Takes the following arguments:

  * `hookGroupId`
  * `hookId`

```python
# Sync calls
hooks.removeHook(hookGroupId, hookId) # -> None
hooks.removeHook(hookGroupId='value', hookId='value') # -> None
# Async call
await asyncHooks.removeHook(hookGroupId, hookId) # -> None
await asyncHooks.removeHook(hookGroupId='value', hookId='value') # -> None
```

#### Trigger a hook
This endpoint will trigger the creation of a task from a hook definition.

The HTTP payload must match the hooks `triggerSchema`.  If it does, it is
provided as the `payload` property of the JSON-e context used to render the
task template.



Takes the following arguments:

  * `hookGroupId`
  * `hookId`

Has required input schema

Has required output schema

```python
# Sync calls
hooks.triggerHook(hookGroupId, hookId, payload) # -> result
hooks.triggerHook(payload, hookGroupId='value', hookId='value') # -> result
# Async call
await asyncHooks.triggerHook(hookGroupId, hookId, payload) # -> result
await asyncHooks.triggerHook(payload, hookGroupId='value', hookId='value') # -> result
```

#### Get a trigger token
Retrieve a unique secret token for triggering the specified hook. This
token can be deactivated with `resetTriggerToken`.



Takes the following arguments:

  * `hookGroupId`
  * `hookId`

Has required output schema

```python
# Sync calls
hooks.getTriggerToken(hookGroupId, hookId) # -> result
hooks.getTriggerToken(hookGroupId='value', hookId='value') # -> result
# Async call
await asyncHooks.getTriggerToken(hookGroupId, hookId) # -> result
await asyncHooks.getTriggerToken(hookGroupId='value', hookId='value') # -> result
```

#### Reset a trigger token
Reset the token for triggering a given hook. This invalidates token that
may have been issued via getTriggerToken with a new token.



Takes the following arguments:

  * `hookGroupId`
  * `hookId`

Has required output schema

```python
# Sync calls
hooks.resetTriggerToken(hookGroupId, hookId) # -> result
hooks.resetTriggerToken(hookGroupId='value', hookId='value') # -> result
# Async call
await asyncHooks.resetTriggerToken(hookGroupId, hookId) # -> result
await asyncHooks.resetTriggerToken(hookGroupId='value', hookId='value') # -> result
```

#### Trigger a hook with a token
This endpoint triggers a defined hook with a valid token.

The HTTP payload must match the hooks `triggerSchema`.  If it does, it is
provided as the `payload` property of the JSON-e context used to render the
task template.



Takes the following arguments:

  * `hookGroupId`
  * `hookId`
  * `token`

Has required input schema

Has required output schema

```python
# Sync calls
hooks.triggerHookWithToken(hookGroupId, hookId, token, payload) # -> result
hooks.triggerHookWithToken(payload, hookGroupId='value', hookId='value', token='value') # -> result
# Async call
await asyncHooks.triggerHookWithToken(hookGroupId, hookId, token, payload) # -> result
await asyncHooks.triggerHookWithToken(payload, hookGroupId='value', hookId='value', token='value') # -> result
```

#### Get information about recent hook fires
This endpoint will return information about the the last few times this hook has been
fired, including whether the hook was fired successfully or not



Takes the following arguments:

  * `hookGroupId`
  * `hookId`

Has required output schema

```python
# Sync calls
hooks.listLastFires(hookGroupId, hookId) # -> result
hooks.listLastFires(hookGroupId='value', hookId='value') # -> result
# Async call
await asyncHooks.listLastFires(hookGroupId, hookId) # -> result
await asyncHooks.listLastFires(hookGroupId='value', hookId='value') # -> result
```




### Exchanges in `taskcluster.HooksEvents`
```python
import taskcluster

# Create HooksEvents client instance
hooksEvents = taskcluster.HooksEvents(options)
```
The hooks service is responsible for creating tasks at specific times orin .  response to webhooks and API calls.Using this exchange allows us tomake hooks which repsond to particular pulse messagesThese exchanges provide notifications when a hook is created, updatedor deleted. This is so that the listener running in a different hooks process at the other end can direct another listener specified by`hookGroupId` and `hookId` to synchronize its bindings. But you are ofcourse welcome to use these for other purposes, monitoring changes for example.
#### Hook Created Messages
 * `hooksEvents.hookCreated(routingKeyPattern) -> routingKey`
   * `reserved` Description: Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.

#### Hook Updated Messages
 * `hooksEvents.hookUpdated(routingKeyPattern) -> routingKey`
   * `reserved` Description: Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.

#### Hook Deleted Messages
 * `hooksEvents.hookDeleted(routingKeyPattern) -> routingKey`
   * `reserved` Description: Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.




### Methods in `taskcluster.Index`
```python
import asyncio # Only for async 
import taskcluster
import taskcluster.aio

# Create Index client instance
index = taskcluster.Index(options)
# Below only for async instances, assume already in coroutine
loop = asyncio.get_event_loop()
session = taskcluster.aio.createSession(loop=loop)
asyncIndex = taskcluster.aio.Index(options, session=session)
```
The index service is responsible for indexing tasks. The service ensures that
tasks can be located by user-defined names.

As described in the service documentation, tasks are typically indexed via Pulse
messages, so the most common use of API methods is to read from the index.
#### Ping Server
Respond without doing anything.
This endpoint is used to check that the service is up.


```python
# Sync calls
index.ping() # -> None
# Async call
await asyncIndex.ping() # -> None
```

#### Find Indexed Task
Find a task by index path, returning the highest-rank task with that path. If no
task exists for the given path, this API end-point will respond with a 404 status.



Takes the following arguments:

  * `indexPath`

Has required output schema

```python
# Sync calls
index.findTask(indexPath) # -> result
index.findTask(indexPath='value') # -> result
# Async call
await asyncIndex.findTask(indexPath) # -> result
await asyncIndex.findTask(indexPath='value') # -> result
```

#### List Namespaces
List the namespaces immediately under a given namespace.

This endpoint
lists up to 1000 namespaces. If more namespaces are present, a
`continuationToken` will be returned, which can be given in the next
request. For the initial request, the payload should be an empty JSON
object.



Takes the following arguments:

  * `namespace`

Has required output schema

```python
# Sync calls
index.listNamespaces(namespace) # -> result
index.listNamespaces(namespace='value') # -> result
# Async call
await asyncIndex.listNamespaces(namespace) # -> result
await asyncIndex.listNamespaces(namespace='value') # -> result
```

#### List Tasks
List the tasks immediately under a given namespace.

This endpoint
lists up to 1000 tasks. If more tasks are present, a
`continuationToken` will be returned, which can be given in the next
request. For the initial request, the payload should be an empty JSON
object.

**Remark**, this end-point is designed for humans browsing for tasks, not
services, as that makes little sense.



Takes the following arguments:

  * `namespace`

Has required output schema

```python
# Sync calls
index.listTasks(namespace) # -> result
index.listTasks(namespace='value') # -> result
# Async call
await asyncIndex.listTasks(namespace) # -> result
await asyncIndex.listTasks(namespace='value') # -> result
```

#### Insert Task into Index
Insert a task into the index.  If the new rank is less than the existing rank
at the given index path, the task is not indexed but the response is still 200 OK.

Please see the introduction above for information
about indexing successfully completed tasks automatically using custom routes.



Takes the following arguments:

  * `namespace`

Has required input schema

Has required output schema

```python
# Sync calls
index.insertTask(namespace, payload) # -> result
index.insertTask(payload, namespace='value') # -> result
# Async call
await asyncIndex.insertTask(namespace, payload) # -> result
await asyncIndex.insertTask(payload, namespace='value') # -> result
```

#### Get Artifact From Indexed Task
Find a task by index path and redirect to the artifact on the most recent
run with the given `name`.

Note that multiple calls to this endpoint may return artifacts from differen tasks
if a new task is inserted into the index between calls. Avoid using this method as
a stable link to multiple, connected files if the index path does not contain a
unique identifier.  For example, the following two links may return unrelated files:
* https://tc.example.com/api/index/v1/task/some-app.win64.latest.installer/artifacts/public/installer.exe`
* https://tc.example.com/api/index/v1/task/some-app.win64.latest.installer/artifacts/public/debug-symbols.zip`

This problem be remedied by including the revision in the index path or by bundling both
installer and debug symbols into a single artifact.

If no task exists for the given index path, this API end-point responds with 404.



Takes the following arguments:

  * `indexPath`
  * `name`

```python
# Sync calls
index.findArtifactFromTask(indexPath, name) # -> None
index.findArtifactFromTask(indexPath='value', name='value') # -> None
# Async call
await asyncIndex.findArtifactFromTask(indexPath, name) # -> None
await asyncIndex.findArtifactFromTask(indexPath='value', name='value') # -> None
```




### Methods in `taskcluster.Login`
```python
import asyncio # Only for async 
import taskcluster
import taskcluster.aio

# Create Login client instance
login = taskcluster.Login(options)
# Below only for async instances, assume already in coroutine
loop = asyncio.get_event_loop()
session = taskcluster.aio.createSession(loop=loop)
asyncLogin = taskcluster.aio.Login(options, session=session)
```
The Login service serves as the interface between external authentication
systems and Taskcluster credentials.
#### Ping Server
Respond without doing anything.
This endpoint is used to check that the service is up.


```python
# Sync calls
login.ping() # -> None
# Async call
await asyncLogin.ping() # -> None
```

#### Get Taskcluster credentials given a suitable `access_token`
Given an OIDC `access_token` from a trusted OpenID provider, return a
set of Taskcluster credentials for use on behalf of the identified
user.

This method is typically not called with a Taskcluster client library
and does not accept Hawk credentials. The `access_token` should be
given in an `Authorization` header:
```
Authorization: Bearer abc.xyz
```

The `access_token` is first verified against the named
:provider, then passed to the provider's APIBuilder to retrieve a user
profile. That profile is then used to generate Taskcluster credentials
appropriate to the user. Note that the resulting credentials may or may
not include a `certificate` property. Callers should be prepared for either
alternative.

The given credentials will expire in a relatively short time. Callers should
monitor this expiration and refresh the credentials if necessary, by calling
this endpoint again, if they have expired.



Takes the following arguments:

  * `provider`

Has required output schema

```python
# Sync calls
login.oidcCredentials(provider) # -> result
login.oidcCredentials(provider='value') # -> result
# Async call
await asyncLogin.oidcCredentials(provider) # -> result
await asyncLogin.oidcCredentials(provider='value') # -> result
```




### Methods in `taskcluster.Notify`
```python
import asyncio # Only for async 
import taskcluster
import taskcluster.aio

# Create Notify client instance
notify = taskcluster.Notify(options)
# Below only for async instances, assume already in coroutine
loop = asyncio.get_event_loop()
session = taskcluster.aio.createSession(loop=loop)
asyncNotify = taskcluster.aio.Notify(options, session=session)
```
The notification service listens for tasks with associated notifications
and handles requests to send emails and post pulse messages.
#### Ping Server
Respond without doing anything.
This endpoint is used to check that the service is up.


```python
# Sync calls
notify.ping() # -> None
# Async call
await asyncNotify.ping() # -> None
```

#### Send an Email
Send an email to `address`. The content is markdown and will be rendered
to HTML, but both the HTML and raw markdown text will be sent in the
email. If a link is included, it will be rendered to a nice button in the
HTML version of the email


Has required input schema

```python
# Sync calls
notify.email(payload) # -> None
# Async call
await asyncNotify.email(payload) # -> None
```

#### Publish a Pulse Message
Publish a message on pulse with the given `routingKey`.


Has required input schema

```python
# Sync calls
notify.pulse(payload) # -> None
# Async call
await asyncNotify.pulse(payload) # -> None
```

#### Post IRC Message
Post a message on IRC to a specific channel or user, or a specific user
on a specific channel.

Success of this API method does not imply the message was successfully
posted. This API method merely inserts the IRC message into a queue
that will be processed by a background process.
This allows us to re-send the message in face of connection issues.

However, if the user isn't online the message will be dropped without
error. We maybe improve this behavior in the future. For now just keep
in mind that IRC is a best-effort service.


Has required input schema

```python
# Sync calls
notify.irc(payload) # -> None
# Async call
await asyncNotify.irc(payload) # -> None
```

#### Denylist Given Address
Add the given address to the notification denylist. The address
can be of either of the three supported address type namely pulse, email
or IRC(user or channel). Addresses in the denylist will be ignored
by the notification service.


Has required input schema

```python
# Sync calls
notify.addDenylistAddress(payload) # -> None
# Async call
await asyncNotify.addDenylistAddress(payload) # -> None
```

#### Delete Denylisted Address
Delete the specified address from the notification denylist.


Has required input schema

```python
# Sync calls
notify.deleteDenylistAddress(payload) # -> None
# Async call
await asyncNotify.deleteDenylistAddress(payload) # -> None
```

#### List Denylisted Notifications
Lists all the denylisted addresses.

By default this end-point will try to return up to 1000 addresses in one
request. But it **may return less**, even if more tasks are available.
It may also return a `continuationToken` even though there are no more
results. However, you can only be sure to have seen all results if you
keep calling `list` with the last `continuationToken` until you
get a result without a `continuationToken`.

If you are not interested in listing all the members at once, you may
use the query-string option `limit` to return fewer.


Has required output schema

```python
# Sync calls
notify.listDenylist() # -> result
# Async call
await asyncNotify.listDenylist() # -> result
```




### Exchanges in `taskcluster.NotifyEvents`
```python
import taskcluster

# Create NotifyEvents client instance
notifyEvents = taskcluster.NotifyEvents(options)
```
This pretty much only contains the simple free-form
message that can be published from this service from a request
by anybody with the proper scopes.
#### Notification Messages
 * `notifyEvents.notify(routingKeyPattern) -> routingKey`
   * `routingKeyKind` is constant of `primary`  is required  Description: Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key.
   * `reserved` Description: Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.

#### Request for irc notification
 * `notifyEvents.ircRequest(routingKeyPattern) -> routingKey`
   * `routingKeyKind` is constant of `primary`  is required  Description: Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key.
   * `reserved` Description: Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.




### Methods in `taskcluster.PurgeCache`
```python
import asyncio # Only for async 
import taskcluster
import taskcluster.aio

# Create PurgeCache client instance
purgeCache = taskcluster.PurgeCache(options)
# Below only for async instances, assume already in coroutine
loop = asyncio.get_event_loop()
session = taskcluster.aio.createSession(loop=loop)
asyncPurgeCache = taskcluster.aio.PurgeCache(options, session=session)
```
The purge-cache service is responsible for tracking cache-purge requests.

User create purge requests for specific caches on specific workers, and
these requests are timestamped.  Workers consult the service before
starting a new task, and purge any caches older than the timestamp.
#### Ping Server
Respond without doing anything.
This endpoint is used to check that the service is up.


```python
# Sync calls
purgeCache.ping() # -> None
# Async call
await asyncPurgeCache.ping() # -> None
```

#### Purge Worker Cache
Publish a request to purge caches named `cacheName` with
on `provisionerId`/`workerType` workers.

If such a request already exists, its `before` timestamp is updated to
the current time.



Takes the following arguments:

  * `provisionerId`
  * `workerType`

Has required input schema

```python
# Sync calls
purgeCache.purgeCache(provisionerId, workerType, payload) # -> None
purgeCache.purgeCache(payload, provisionerId='value', workerType='value') # -> None
# Async call
await asyncPurgeCache.purgeCache(provisionerId, workerType, payload) # -> None
await asyncPurgeCache.purgeCache(payload, provisionerId='value', workerType='value') # -> None
```

#### All Open Purge Requests
View all active purge requests.

This is useful mostly for administors to view
the set of open purge requests. It should not
be used by workers. They should use the purgeRequests
endpoint that is specific to their workerType and
provisionerId.


Has required output schema

```python
# Sync calls
purgeCache.allPurgeRequests() # -> result
# Async call
await asyncPurgeCache.allPurgeRequests() # -> result
```

#### Open Purge Requests for a provisionerId/workerType pair
List the caches for this `provisionerId`/`workerType` that should to be
purged if they are from before the time given in the response.

This is intended to be used by workers to determine which caches to purge.



Takes the following arguments:

  * `provisionerId`
  * `workerType`

Has required output schema

```python
# Sync calls
purgeCache.purgeRequests(provisionerId, workerType) # -> result
purgeCache.purgeRequests(provisionerId='value', workerType='value') # -> result
# Async call
await asyncPurgeCache.purgeRequests(provisionerId, workerType) # -> result
await asyncPurgeCache.purgeRequests(provisionerId='value', workerType='value') # -> result
```




### Methods in `taskcluster.Queue`
```python
import asyncio # Only for async 
import taskcluster
import taskcluster.aio

# Create Queue client instance
queue = taskcluster.Queue(options)
# Below only for async instances, assume already in coroutine
loop = asyncio.get_event_loop()
session = taskcluster.aio.createSession(loop=loop)
asyncQueue = taskcluster.aio.Queue(options, session=session)
```
The queue service is responsible for accepting tasks and track their state
as they are executed by workers. In order ensure they are eventually
resolved.

This document describes the API end-points offered by the queue. These 
end-points targets the following audience:
 * Schedulers, who create tasks to be executed,
 * Workers, who execute tasks, and
 * Tools, that wants to inspect the state of a task.
#### Ping Server
Respond without doing anything.
This endpoint is used to check that the service is up.


```python
# Sync calls
queue.ping() # -> None
# Async call
await asyncQueue.ping() # -> None
```

#### Get Task Definition
This end-point will return the task-definition. Notice that the task
definition may have been modified by queue, if an optional property is
not specified the queue may provide a default value.



Takes the following arguments:

  * `taskId`

Has required output schema

```python
# Sync calls
queue.task(taskId) # -> result
queue.task(taskId='value') # -> result
# Async call
await asyncQueue.task(taskId) # -> result
await asyncQueue.task(taskId='value') # -> result
```

#### Get task status
Get task status structure from `taskId`



Takes the following arguments:

  * `taskId`

Has required output schema

```python
# Sync calls
queue.status(taskId) # -> result
queue.status(taskId='value') # -> result
# Async call
await asyncQueue.status(taskId) # -> result
await asyncQueue.status(taskId='value') # -> result
```

#### List Task Group
List tasks sharing the same `taskGroupId`.

As a task-group may contain an unbounded number of tasks, this end-point
may return a `continuationToken`. To continue listing tasks you must call
the `listTaskGroup` again with the `continuationToken` as the
query-string option `continuationToken`.

By default this end-point will try to return up to 1000 members in one
request. But it **may return less**, even if more tasks are available.
It may also return a `continuationToken` even though there are no more
results. However, you can only be sure to have seen all results if you
keep calling `listTaskGroup` with the last `continuationToken` until you
get a result without a `continuationToken`.

If you are not interested in listing all the members at once, you may
use the query-string option `limit` to return fewer.



Takes the following arguments:

  * `taskGroupId`

Has required output schema

```python
# Sync calls
queue.listTaskGroup(taskGroupId) # -> result
queue.listTaskGroup(taskGroupId='value') # -> result
# Async call
await asyncQueue.listTaskGroup(taskGroupId) # -> result
await asyncQueue.listTaskGroup(taskGroupId='value') # -> result
```

#### List Dependent Tasks
List tasks that depend on the given `taskId`.

As many tasks from different task-groups may dependent on a single tasks,
this end-point may return a `continuationToken`. To continue listing
tasks you must call `listDependentTasks` again with the
`continuationToken` as the query-string option `continuationToken`.

By default this end-point will try to return up to 1000 tasks in one
request. But it **may return less**, even if more tasks are available.
It may also return a `continuationToken` even though there are no more
results. However, you can only be sure to have seen all results if you
keep calling `listDependentTasks` with the last `continuationToken` until
you get a result without a `continuationToken`.

If you are not interested in listing all the tasks at once, you may
use the query-string option `limit` to return fewer.



Takes the following arguments:

  * `taskId`

Has required output schema

```python
# Sync calls
queue.listDependentTasks(taskId) # -> result
queue.listDependentTasks(taskId='value') # -> result
# Async call
await asyncQueue.listDependentTasks(taskId) # -> result
await asyncQueue.listDependentTasks(taskId='value') # -> result
```

#### Create New Task
Create a new task, this is an **idempotent** operation, so repeat it if
you get an internal server error or network connection is dropped.

**Task `deadline`**: the deadline property can be no more than 5 days
into the future. This is to limit the amount of pending tasks not being
taken care of. Ideally, you should use a much shorter deadline.

**Task expiration**: the `expires` property must be greater than the
task `deadline`. If not provided it will default to `deadline` + one
year. Notice, that artifacts created by task must expire before the task.

**Task specific routing-keys**: using the `task.routes` property you may
define task specific routing-keys. If a task has a task specific 
routing-key: `<route>`, then when the AMQP message about the task is
published, the message will be CC'ed with the routing-key: 
`route.<route>`. This is useful if you want another component to listen
for completed tasks you have posted.  The caller must have scope
`queue:route:<route>` for each route.

**Dependencies**: any tasks referenced in `task.dependencies` must have
already been created at the time of this call.

**Scopes**: Note that the scopes required to complete this API call depend
on the content of the `scopes`, `routes`, `schedulerId`, `priority`,
`provisionerId`, and `workerType` properties of the task definition.

**Legacy Scopes**: The `queue:create-task:..` scope without a priority and
the `queue:define-task:..` and `queue:task-group-id:..` scopes are considered
legacy and should not be used. Note that the new, non-legacy scopes require
a `queue:scheduler-id:..` scope as well as scopes for the proper priority.



Takes the following arguments:

  * `taskId`

Has required input schema

Has required output schema

```python
# Sync calls
queue.createTask(taskId, payload) # -> result
queue.createTask(payload, taskId='value') # -> result
# Async call
await asyncQueue.createTask(taskId, payload) # -> result
await asyncQueue.createTask(payload, taskId='value') # -> result
```

#### Define Task
**Deprecated**, this is the same as `createTask` with a **self-dependency**.
This is only present for legacy.



Takes the following arguments:

  * `taskId`

Has required input schema

Has required output schema

```python
# Sync calls
queue.defineTask(taskId, payload) # -> result
queue.defineTask(payload, taskId='value') # -> result
# Async call
await asyncQueue.defineTask(taskId, payload) # -> result
await asyncQueue.defineTask(payload, taskId='value') # -> result
```

#### Schedule Defined Task
scheduleTask will schedule a task to be executed, even if it has
unresolved dependencies. A task would otherwise only be scheduled if
its dependencies were resolved.

This is useful if you have defined a task that depends on itself or on
some other task that has not been resolved, but you wish the task to be
scheduled immediately.

This will announce the task as pending and workers will be allowed to
claim it and resolve the task.

**Note** this operation is **idempotent** and will not fail or complain
if called with a `taskId` that is already scheduled, or even resolved.
To reschedule a task previously resolved, use `rerunTask`.



Takes the following arguments:

  * `taskId`

Has required output schema

```python
# Sync calls
queue.scheduleTask(taskId) # -> result
queue.scheduleTask(taskId='value') # -> result
# Async call
await asyncQueue.scheduleTask(taskId) # -> result
await asyncQueue.scheduleTask(taskId='value') # -> result
```

#### Rerun a Resolved Task
This method _reruns_ a previously resolved task, even if it was
_completed_. This is useful if your task completes unsuccessfully, and
you just want to run it from scratch again. This will also reset the
number of `retries` allowed.

This method is deprecated in favour of creating a new task with the same
task definition (but with a new taskId).

Remember that `retries` in the task status counts the number of runs that
the queue have started because the worker stopped responding, for example
because a spot node died.

**Remark** this operation is idempotent, if you try to rerun a task that
is not either `failed` or `completed`, this operation will just return
the current task status.



Takes the following arguments:

  * `taskId`

Has required output schema

```python
# Sync calls
queue.rerunTask(taskId) # -> result
queue.rerunTask(taskId='value') # -> result
# Async call
await asyncQueue.rerunTask(taskId) # -> result
await asyncQueue.rerunTask(taskId='value') # -> result
```

#### Cancel Task
This method will cancel a task that is either `unscheduled`, `pending` or
`running`. It will resolve the current run as `exception` with
`reasonResolved` set to `canceled`. If the task isn't scheduled yet, ie.
it doesn't have any runs, an initial run will be added and resolved as
described above. Hence, after canceling a task, it cannot be scheduled
with `queue.scheduleTask`, but a new run can be created with
`queue.rerun`. These semantics is equivalent to calling
`queue.scheduleTask` immediately followed by `queue.cancelTask`.

**Remark** this operation is idempotent, if you try to cancel a task that
isn't `unscheduled`, `pending` or `running`, this operation will just
return the current task status.



Takes the following arguments:

  * `taskId`

Has required output schema

```python
# Sync calls
queue.cancelTask(taskId) # -> result
queue.cancelTask(taskId='value') # -> result
# Async call
await asyncQueue.cancelTask(taskId) # -> result
await asyncQueue.cancelTask(taskId='value') # -> result
```

#### Claim Work
Claim pending task(s) for the given `provisionerId`/`workerType` queue.

If any work is available (even if fewer than the requested number of
tasks, this will return immediately. Otherwise, it will block for tens of
seconds waiting for work.  If no work appears, it will return an emtpy
list of tasks.  Callers should sleep a short while (to avoid denial of
service in an error condition) and call the endpoint again.  This is a
simple implementation of "long polling".



Takes the following arguments:

  * `provisionerId`
  * `workerType`

Has required input schema

Has required output schema

```python
# Sync calls
queue.claimWork(provisionerId, workerType, payload) # -> result
queue.claimWork(payload, provisionerId='value', workerType='value') # -> result
# Async call
await asyncQueue.claimWork(provisionerId, workerType, payload) # -> result
await asyncQueue.claimWork(payload, provisionerId='value', workerType='value') # -> result
```

#### Claim Task
claim a task - never documented



Takes the following arguments:

  * `taskId`
  * `runId`

Has required input schema

Has required output schema

```python
# Sync calls
queue.claimTask(taskId, runId, payload) # -> result
queue.claimTask(payload, taskId='value', runId='value') # -> result
# Async call
await asyncQueue.claimTask(taskId, runId, payload) # -> result
await asyncQueue.claimTask(payload, taskId='value', runId='value') # -> result
```

#### Reclaim task
Refresh the claim for a specific `runId` for given `taskId`. This updates
the `takenUntil` property and returns a new set of temporary credentials
for performing requests on behalf of the task. These credentials should
be used in-place of the credentials returned by `claimWork`.

The `reclaimTask` requests serves to:
 * Postpone `takenUntil` preventing the queue from resolving
   `claim-expired`,
 * Refresh temporary credentials used for processing the task, and
 * Abort execution if the task/run have been resolved.

If the `takenUntil` timestamp is exceeded the queue will resolve the run
as _exception_ with reason `claim-expired`, and proceeded to retry to the
task. This ensures that tasks are retried, even if workers disappear
without warning.

If the task is resolved, this end-point will return `409` reporting
`RequestConflict`. This typically happens if the task have been canceled
or the `task.deadline` have been exceeded. If reclaiming fails, workers
should abort the task and forget about the given `runId`. There is no
need to resolve the run or upload artifacts.



Takes the following arguments:

  * `taskId`
  * `runId`

Has required output schema

```python
# Sync calls
queue.reclaimTask(taskId, runId) # -> result
queue.reclaimTask(taskId='value', runId='value') # -> result
# Async call
await asyncQueue.reclaimTask(taskId, runId) # -> result
await asyncQueue.reclaimTask(taskId='value', runId='value') # -> result
```

#### Report Run Completed
Report a task completed, resolving the run as `completed`.



Takes the following arguments:

  * `taskId`
  * `runId`

Has required output schema

```python
# Sync calls
queue.reportCompleted(taskId, runId) # -> result
queue.reportCompleted(taskId='value', runId='value') # -> result
# Async call
await asyncQueue.reportCompleted(taskId, runId) # -> result
await asyncQueue.reportCompleted(taskId='value', runId='value') # -> result
```

#### Report Run Failed
Report a run failed, resolving the run as `failed`. Use this to resolve
a run that failed because the task specific code behaved unexpectedly.
For example the task exited non-zero, or didn't produce expected output.

Do not use this if the task couldn't be run because if malformed
payload, or other unexpected condition. In these cases we have a task
exception, which should be reported with `reportException`.



Takes the following arguments:

  * `taskId`
  * `runId`

Has required output schema

```python
# Sync calls
queue.reportFailed(taskId, runId) # -> result
queue.reportFailed(taskId='value', runId='value') # -> result
# Async call
await asyncQueue.reportFailed(taskId, runId) # -> result
await asyncQueue.reportFailed(taskId='value', runId='value') # -> result
```

#### Report Task Exception
Resolve a run as _exception_. Generally, you will want to report tasks as
failed instead of exception. You should `reportException` if,

  * The `task.payload` is invalid,
  * Non-existent resources are referenced,
  * Declared actions cannot be executed due to unavailable resources,
  * The worker had to shutdown prematurely,
  * The worker experienced an unknown error, or,
  * The task explicitly requested a retry.

Do not use this to signal that some user-specified code crashed for any
reason specific to this code. If user-specific code hits a resource that
is temporarily unavailable worker should report task _failed_.



Takes the following arguments:

  * `taskId`
  * `runId`

Has required input schema

Has required output schema

```python
# Sync calls
queue.reportException(taskId, runId, payload) # -> result
queue.reportException(payload, taskId='value', runId='value') # -> result
# Async call
await asyncQueue.reportException(taskId, runId, payload) # -> result
await asyncQueue.reportException(payload, taskId='value', runId='value') # -> result
```

#### Create Artifact
This API end-point creates an artifact for a specific run of a task. This
should **only** be used by a worker currently operating on this task, or
from a process running within the task (ie. on the worker).

All artifacts must specify when they `expires`, the queue will
automatically take care of deleting artifacts past their
expiration point. This features makes it feasible to upload large
intermediate artifacts from data processing applications, as the
artifacts can be set to expire a few days later.

We currently support 3 different `storageType`s, each storage type have
slightly different features and in some cases difference semantics.
We also have 2 deprecated `storageType`s which are only maintained for
backwards compatiability and should not be used in new implementations

**Blob artifacts**, are useful for storing large files.  Currently, these
are all stored in S3 but there are facilities for adding support for other
backends in futre.  A call for this type of artifact must provide information
about the file which will be uploaded.  This includes sha256 sums and sizes.
This method will return a list of general form HTTP requests which are signed
by AWS S3 credentials managed by the Queue.  Once these requests are completed
the list of `ETag` values returned by the requests must be passed to the
queue `completeArtifact` method

**S3 artifacts**, DEPRECATED is useful for static files which will be
stored on S3. When creating an S3 artifact the queue will return a
pre-signed URL to which you can do a `PUT` request to upload your
artifact. Note that `PUT` request **must** specify the `content-length`
header and **must** give the `content-type` header the same value as in
the request to `createArtifact`.

**Azure artifacts**, DEPRECATED are stored in _Azure Blob Storage_ service
which given the consistency guarantees and API interface offered by Azure
is more suitable for artifacts that will be modified during the execution
of the task. For example docker-worker has a feature that persists the
task log to Azure Blob Storage every few seconds creating a somewhat
live log. A request to create an Azure artifact will return a URL
featuring a [Shared-Access-Signature](http://msdn.microsoft.com/en-us/library/azure/dn140256.aspx),
refer to MSDN for further information on how to use these.
**Warning: azure artifact is currently an experimental feature subject
to changes and data-drops.**

**Reference artifacts**, only consists of meta-data which the queue will
store for you. These artifacts really only have a `url` property and
when the artifact is requested the client will be redirect the URL
provided with a `303` (See Other) redirect. Please note that we cannot
delete artifacts you upload to other service, we can only delete the
reference to the artifact, when it expires.

**Error artifacts**, only consists of meta-data which the queue will
store for you. These artifacts are only meant to indicate that you the
worker or the task failed to generate a specific artifact, that you
would otherwise have uploaded. For example docker-worker will upload an
error artifact, if the file it was supposed to upload doesn't exists or
turns out to be a directory. Clients requesting an error artifact will
get a `424` (Failed Dependency) response. This is mainly designed to
ensure that dependent tasks can distinguish between artifacts that were
suppose to be generated and artifacts for which the name is misspelled.

**Artifact immutability**, generally speaking you cannot overwrite an
artifact when created. But if you repeat the request with the same
properties the request will succeed as the operation is idempotent.
This is useful if you need to refresh a signed URL while uploading.
Do not abuse this to overwrite artifacts created by another entity!
Such as worker-host overwriting artifact created by worker-code.

As a special case the `url` property on _reference artifacts_ can be
updated. You should only use this to update the `url` property for
reference artifacts your process has created.



Takes the following arguments:

  * `taskId`
  * `runId`
  * `name`

Has required input schema

Has required output schema

```python
# Sync calls
queue.createArtifact(taskId, runId, name, payload) # -> result
queue.createArtifact(payload, taskId='value', runId='value', name='value') # -> result
# Async call
await asyncQueue.createArtifact(taskId, runId, name, payload) # -> result
await asyncQueue.createArtifact(payload, taskId='value', runId='value', name='value') # -> result
```

#### Complete Artifact
This endpoint finalises an upload done through the blob `storageType`.
The queue will ensure that the task/run is still allowing artifacts
to be uploaded.  For single-part S3 blob artifacts, this endpoint
will simply ensure the artifact is present in S3.  For multipart S3
artifacts, the endpoint will perform the commit step of the multipart
upload flow.  As the final step for both multi and single part artifacts,
the `present` entity field will be set to `true` to reflect that the
artifact is now present and a message published to pulse.  NOTE: This
endpoint *must* be called for all artifacts of storageType 'blob'



Takes the following arguments:

  * `taskId`
  * `runId`
  * `name`

Has required input schema

```python
# Sync calls
queue.completeArtifact(taskId, runId, name, payload) # -> None
queue.completeArtifact(payload, taskId='value', runId='value', name='value') # -> None
# Async call
await asyncQueue.completeArtifact(taskId, runId, name, payload) # -> None
await asyncQueue.completeArtifact(payload, taskId='value', runId='value', name='value') # -> None
```

#### Get Artifact from Run
Get artifact by `<name>` from a specific run.

**Public Artifacts**, in-order to get an artifact you need the scope
`queue:get-artifact:<name>`, where `<name>` is the name of the artifact.
But if the artifact `name` starts with `public/`, authentication and
authorization is not necessary to fetch the artifact.

**API Clients**, this method will redirect you to the artifact, if it is
stored externally. Either way, the response may not be JSON. So API
client users might want to generate a signed URL for this end-point and
use that URL with an HTTP client that can handle responses correctly.

**Downloading artifacts**
There are some special considerations for those http clients which download
artifacts.  This api endpoint is designed to be compatible with an HTTP 1.1
compliant client, but has extra features to ensure the download is valid.
It is strongly recommend that consumers use either taskcluster-lib-artifact (JS),
taskcluster-lib-artifact-go (Go) or the CLI written in Go to interact with
artifacts.

In order to download an artifact the following must be done:

1. Obtain queue url.  Building a signed url with a taskcluster client is
recommended
1. Make a GET request which does not follow redirects
1. In all cases, if specified, the
x-taskcluster-location-{content,transfer}-{sha256,length} values must be
validated to be equal to the Content-Length and Sha256 checksum of the
final artifact downloaded. as well as any intermediate redirects
1. If this response is a 500-series error, retry using an exponential
backoff.  No more than 5 retries should be attempted
1. If this response is a 400-series error, treat it appropriately for
your context.  This might be an error in responding to this request or
an Error storage type body.  This request should not be retried.
1. If this response is a 200-series response, the response body is the artifact.
If the x-taskcluster-location-{content,transfer}-{sha256,length} and
x-taskcluster-location-content-encoding are specified, they should match
this response body
1. If the response type is a 300-series redirect, the artifact will be at the
location specified by the `Location` header.  There are multiple artifact storage
types which use a 300-series redirect.
1. For all redirects followed, the user must verify that the content-sha256, content-length,
transfer-sha256, transfer-length and content-encoding match every further request.  The final
artifact must also be validated against the values specified in the original queue response
1. Caching of requests with an x-taskcluster-artifact-storage-type value of `reference`
must not occur
1. A request which has x-taskcluster-artifact-storage-type value of `blob` and does not
have x-taskcluster-location-content-sha256 or x-taskcluster-location-content-length
must be treated as an error

**Headers**
The following important headers are set on the response to this method:

* location: the url of the artifact if a redirect is to be performed
* x-taskcluster-artifact-storage-type: the storage type.  Example: blob, s3, error

The following important headers are set on responses to this method for Blob artifacts

* x-taskcluster-location-content-sha256: the SHA256 of the artifact
*after* any content-encoding is undone.  Sha256 is hex encoded (e.g. [0-9A-Fa-f]{64})
* x-taskcluster-location-content-length: the number of bytes *after* any content-encoding
is undone
* x-taskcluster-location-transfer-sha256: the SHA256 of the artifact
*before* any content-encoding is undone.  This is the SHA256 of what is sent over
the wire.  Sha256 is hex encoded (e.g. [0-9A-Fa-f]{64})
* x-taskcluster-location-transfer-length: the number of bytes *after* any content-encoding
is undone
* x-taskcluster-location-content-encoding: the content-encoding used.  It will either
be `gzip` or `identity` right now.  This is hardcoded to a value set when the artifact
was created and no content-negotiation occurs
* x-taskcluster-location-content-type: the content-type of the artifact

**Caching**, artifacts may be cached in data centers closer to the
workers in-order to reduce bandwidth costs. This can lead to longer
response times. Caching can be skipped by setting the header
`x-taskcluster-skip-cache: true`, this should only be used for resources
where request volume is known to be low, and caching not useful.
(This feature may be disabled in the future, use is sparingly!)



Takes the following arguments:

  * `taskId`
  * `runId`
  * `name`

```python
# Sync calls
queue.getArtifact(taskId, runId, name) # -> None
queue.getArtifact(taskId='value', runId='value', name='value') # -> None
# Async call
await asyncQueue.getArtifact(taskId, runId, name) # -> None
await asyncQueue.getArtifact(taskId='value', runId='value', name='value') # -> None
```

#### Get Artifact from Latest Run
Get artifact by `<name>` from the last run of a task.

**Public Artifacts**, in-order to get an artifact you need the scope
`queue:get-artifact:<name>`, where `<name>` is the name of the artifact.
But if the artifact `name` starts with `public/`, authentication and
authorization is not necessary to fetch the artifact.

**API Clients**, this method will redirect you to the artifact, if it is
stored externally. Either way, the response may not be JSON. So API
client users might want to generate a signed URL for this end-point and
use that URL with a normal HTTP client.

**Remark**, this end-point is slightly slower than
`queue.getArtifact`, so consider that if you already know the `runId` of
the latest run. Otherwise, just us the most convenient API end-point.



Takes the following arguments:

  * `taskId`
  * `name`

```python
# Sync calls
queue.getLatestArtifact(taskId, name) # -> None
queue.getLatestArtifact(taskId='value', name='value') # -> None
# Async call
await asyncQueue.getLatestArtifact(taskId, name) # -> None
await asyncQueue.getLatestArtifact(taskId='value', name='value') # -> None
```

#### Get Artifacts from Run
Returns a list of artifacts and associated meta-data for a given run.

As a task may have many artifacts paging may be necessary. If this
end-point returns a `continuationToken`, you should call the end-point
again with the `continuationToken` as the query-string option:
`continuationToken`.

By default this end-point will list up-to 1000 artifacts in a single page
you may limit this with the query-string parameter `limit`.



Takes the following arguments:

  * `taskId`
  * `runId`

Has required output schema

```python
# Sync calls
queue.listArtifacts(taskId, runId) # -> result
queue.listArtifacts(taskId='value', runId='value') # -> result
# Async call
await asyncQueue.listArtifacts(taskId, runId) # -> result
await asyncQueue.listArtifacts(taskId='value', runId='value') # -> result
```

#### Get Artifacts from Latest Run
Returns a list of artifacts and associated meta-data for the latest run
from the given task.

As a task may have many artifacts paging may be necessary. If this
end-point returns a `continuationToken`, you should call the end-point
again with the `continuationToken` as the query-string option:
`continuationToken`.

By default this end-point will list up-to 1000 artifacts in a single page
you may limit this with the query-string parameter `limit`.



Takes the following arguments:

  * `taskId`

Has required output schema

```python
# Sync calls
queue.listLatestArtifacts(taskId) # -> result
queue.listLatestArtifacts(taskId='value') # -> result
# Async call
await asyncQueue.listLatestArtifacts(taskId) # -> result
await asyncQueue.listLatestArtifacts(taskId='value') # -> result
```

#### Get a list of all active provisioners
Get all active provisioners.

The term "provisioner" is taken broadly to mean anything with a provisionerId.
This does not necessarily mean there is an associated service performing any
provisioning activity.

The response is paged. If this end-point returns a `continuationToken`, you
should call the end-point again with the `continuationToken` as a query-string
option. By default this end-point will list up to 1000 provisioners in a single
page. You may limit this with the query-string parameter `limit`.


Has required output schema

```python
# Sync calls
queue.listProvisioners() # -> result
# Async call
await asyncQueue.listProvisioners() # -> result
```

#### Get an active provisioner
Get an active provisioner.

The term "provisioner" is taken broadly to mean anything with a provisionerId.
This does not necessarily mean there is an associated service performing any
provisioning activity.



Takes the following arguments:

  * `provisionerId`

Has required output schema

```python
# Sync calls
queue.getProvisioner(provisionerId) # -> result
queue.getProvisioner(provisionerId='value') # -> result
# Async call
await asyncQueue.getProvisioner(provisionerId) # -> result
await asyncQueue.getProvisioner(provisionerId='value') # -> result
```

#### Update a provisioner
Declare a provisioner, supplying some details about it.

`declareProvisioner` allows updating one or more properties of a provisioner as long as the required scopes are
possessed. For example, a request to update the `aws-provisioner-v1`
provisioner with a body `{description: 'This provisioner is great'}` would require you to have the scope
`queue:declare-provisioner:aws-provisioner-v1#description`.

The term "provisioner" is taken broadly to mean anything with a provisionerId.
This does not necessarily mean there is an associated service performing any
provisioning activity.



Takes the following arguments:

  * `provisionerId`

Has required input schema

Has required output schema

```python
# Sync calls
queue.declareProvisioner(provisionerId, payload) # -> result
queue.declareProvisioner(payload, provisionerId='value') # -> result
# Async call
await asyncQueue.declareProvisioner(provisionerId, payload) # -> result
await asyncQueue.declareProvisioner(payload, provisionerId='value') # -> result
```

#### Get Number of Pending Tasks
Get an approximate number of pending tasks for the given `provisionerId`
and `workerType`.

The underlying Azure Storage Queues only promises to give us an estimate.
Furthermore, we cache the result in memory for 20 seconds. So consumers
should be no means expect this to be an accurate number.
It is, however, a solid estimate of the number of pending tasks.



Takes the following arguments:

  * `provisionerId`
  * `workerType`

Has required output schema

```python
# Sync calls
queue.pendingTasks(provisionerId, workerType) # -> result
queue.pendingTasks(provisionerId='value', workerType='value') # -> result
# Async call
await asyncQueue.pendingTasks(provisionerId, workerType) # -> result
await asyncQueue.pendingTasks(provisionerId='value', workerType='value') # -> result
```

#### Get a list of all active worker-types
Get all active worker-types for the given provisioner.

The response is paged. If this end-point returns a `continuationToken`, you
should call the end-point again with the `continuationToken` as a query-string
option. By default this end-point will list up to 1000 worker-types in a single
page. You may limit this with the query-string parameter `limit`.



Takes the following arguments:

  * `provisionerId`

Has required output schema

```python
# Sync calls
queue.listWorkerTypes(provisionerId) # -> result
queue.listWorkerTypes(provisionerId='value') # -> result
# Async call
await asyncQueue.listWorkerTypes(provisionerId) # -> result
await asyncQueue.listWorkerTypes(provisionerId='value') # -> result
```

#### Get a worker-type
Get a worker-type from a provisioner.



Takes the following arguments:

  * `provisionerId`
  * `workerType`

Has required output schema

```python
# Sync calls
queue.getWorkerType(provisionerId, workerType) # -> result
queue.getWorkerType(provisionerId='value', workerType='value') # -> result
# Async call
await asyncQueue.getWorkerType(provisionerId, workerType) # -> result
await asyncQueue.getWorkerType(provisionerId='value', workerType='value') # -> result
```

#### Update a worker-type
Declare a workerType, supplying some details about it.

`declareWorkerType` allows updating one or more properties of a worker-type as long as the required scopes are
possessed. For example, a request to update the `gecko-b-1-w2008` worker-type within the `aws-provisioner-v1`
provisioner with a body `{description: 'This worker type is great'}` would require you to have the scope
`queue:declare-worker-type:aws-provisioner-v1/gecko-b-1-w2008#description`.



Takes the following arguments:

  * `provisionerId`
  * `workerType`

Has required input schema

Has required output schema

```python
# Sync calls
queue.declareWorkerType(provisionerId, workerType, payload) # -> result
queue.declareWorkerType(payload, provisionerId='value', workerType='value') # -> result
# Async call
await asyncQueue.declareWorkerType(provisionerId, workerType, payload) # -> result
await asyncQueue.declareWorkerType(payload, provisionerId='value', workerType='value') # -> result
```

#### Get a list of all active workers of a workerType
Get a list of all active workers of a workerType.

`listWorkers` allows a response to be filtered by quarantined and non quarantined workers.
To filter the query, you should call the end-point with `quarantined` as a query-string option with a
true or false value.

The response is paged. If this end-point returns a `continuationToken`, you
should call the end-point again with the `continuationToken` as a query-string
option. By default this end-point will list up to 1000 workers in a single
page. You may limit this with the query-string parameter `limit`.



Takes the following arguments:

  * `provisionerId`
  * `workerType`

Has required output schema

```python
# Sync calls
queue.listWorkers(provisionerId, workerType) # -> result
queue.listWorkers(provisionerId='value', workerType='value') # -> result
# Async call
await asyncQueue.listWorkers(provisionerId, workerType) # -> result
await asyncQueue.listWorkers(provisionerId='value', workerType='value') # -> result
```

#### Get a worker-type
Get a worker from a worker-type.



Takes the following arguments:

  * `provisionerId`
  * `workerType`
  * `workerGroup`
  * `workerId`

Has required output schema

```python
# Sync calls
queue.getWorker(provisionerId, workerType, workerGroup, workerId) # -> result
queue.getWorker(provisionerId='value', workerType='value', workerGroup='value', workerId='value') # -> result
# Async call
await asyncQueue.getWorker(provisionerId, workerType, workerGroup, workerId) # -> result
await asyncQueue.getWorker(provisionerId='value', workerType='value', workerGroup='value', workerId='value') # -> result
```

#### Quarantine a worker
Quarantine a worker



Takes the following arguments:

  * `provisionerId`
  * `workerType`
  * `workerGroup`
  * `workerId`

Has required input schema

Has required output schema

```python
# Sync calls
queue.quarantineWorker(provisionerId, workerType, workerGroup, workerId, payload) # -> result
queue.quarantineWorker(payload, provisionerId='value', workerType='value', workerGroup='value', workerId='value') # -> result
# Async call
await asyncQueue.quarantineWorker(provisionerId, workerType, workerGroup, workerId, payload) # -> result
await asyncQueue.quarantineWorker(payload, provisionerId='value', workerType='value', workerGroup='value', workerId='value') # -> result
```

#### Declare a worker
Declare a worker, supplying some details about it.

`declareWorker` allows updating one or more properties of a worker as long as the required scopes are
possessed.



Takes the following arguments:

  * `provisionerId`
  * `workerType`
  * `workerGroup`
  * `workerId`

Has required input schema

Has required output schema

```python
# Sync calls
queue.declareWorker(provisionerId, workerType, workerGroup, workerId, payload) # -> result
queue.declareWorker(payload, provisionerId='value', workerType='value', workerGroup='value', workerId='value') # -> result
# Async call
await asyncQueue.declareWorker(provisionerId, workerType, workerGroup, workerId, payload) # -> result
await asyncQueue.declareWorker(payload, provisionerId='value', workerType='value', workerGroup='value', workerId='value') # -> result
```




### Exchanges in `taskcluster.QueueEvents`
```python
import taskcluster

# Create QueueEvents client instance
queueEvents = taskcluster.QueueEvents(options)
```
The queue service is responsible for accepting tasks and track their state
as they are executed by workers. In order ensure they are eventually
resolved.

This document describes AMQP exchanges offered by the queue, which allows
third-party listeners to monitor tasks as they progress to resolution.
These exchanges targets the following audience:
 * Schedulers, who takes action after tasks are completed,
 * Workers, who wants to listen for new or canceled tasks (optional),
 * Tools, that wants to update their view as task progress.

You'll notice that all the exchanges in the document shares the same
routing key pattern. This makes it very easy to bind to all messages
about a certain kind tasks.

**Task specific routes**, a task can define a task specific route using
the `task.routes` property. See task creation documentation for details
on permissions required to provide task specific routes. If a task has
the entry `'notify.by-email'` in as task specific route defined in
`task.routes` all messages about this task will be CC'ed with the
routing-key `'route.notify.by-email'`.

These routes will always be prefixed `route.`, so that cannot interfere
with the _primary_ routing key as documented here. Notice that the
_primary_ routing key is always prefixed `primary.`. This is ensured
in the routing key reference, so API clients will do this automatically.

Please, note that the way RabbitMQ works, the message will only arrive
in your queue once, even though you may have bound to the exchange with
multiple routing key patterns that matches more of the CC'ed routing
routing keys.

**Delivery guarantees**, most operations on the queue are idempotent,
which means that if repeated with the same arguments then the requests
will ensure completion of the operation and return the same response.
This is useful if the server crashes or the TCP connection breaks, but
when re-executing an idempotent operation, the queue will also resend
any related AMQP messages. Hence, messages may be repeated.

This shouldn't be much of a problem, as the best you can achieve using
confirm messages with AMQP is at-least-once delivery semantics. Hence,
this only prevents you from obtaining at-most-once delivery semantics.

**Remark**, some message generated by timeouts maybe dropped if the
server crashes at wrong time. Ideally, we'll address this in the
future. For now we suggest you ignore this corner case, and notify us
if this corner case is of concern to you.
#### Task Defined Messages
 * `queueEvents.taskDefined(routingKeyPattern) -> routingKey`
   * `routingKeyKind` is constant of `primary`  is required  Description: Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key.
   * `taskId` is required  Description: `taskId` for the task this message concerns
   * `runId` Description: `runId` of latest run for the task, `_` if no run is exists for the task.
   * `workerGroup` Description: `workerGroup` of latest run for the task, `_` if no run is exists for the task.
   * `workerId` Description: `workerId` of latest run for the task, `_` if no run is exists for the task.
   * `provisionerId` is required  Description: `provisionerId` this task is targeted at.
   * `workerType` is required  Description: `workerType` this task must run on.
   * `schedulerId` is required  Description: `schedulerId` this task was created by.
   * `taskGroupId` is required  Description: `taskGroupId` this task was created in.
   * `reserved` Description: Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.

#### Task Pending Messages
 * `queueEvents.taskPending(routingKeyPattern) -> routingKey`
   * `routingKeyKind` is constant of `primary`  is required  Description: Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key.
   * `taskId` is required  Description: `taskId` for the task this message concerns
   * `runId` is required  Description: `runId` of latest run for the task, `_` if no run is exists for the task.
   * `workerGroup` Description: `workerGroup` of latest run for the task, `_` if no run is exists for the task.
   * `workerId` Description: `workerId` of latest run for the task, `_` if no run is exists for the task.
   * `provisionerId` is required  Description: `provisionerId` this task is targeted at.
   * `workerType` is required  Description: `workerType` this task must run on.
   * `schedulerId` is required  Description: `schedulerId` this task was created by.
   * `taskGroupId` is required  Description: `taskGroupId` this task was created in.
   * `reserved` Description: Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.

#### Task Running Messages
 * `queueEvents.taskRunning(routingKeyPattern) -> routingKey`
   * `routingKeyKind` is constant of `primary`  is required  Description: Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key.
   * `taskId` is required  Description: `taskId` for the task this message concerns
   * `runId` is required  Description: `runId` of latest run for the task, `_` if no run is exists for the task.
   * `workerGroup` is required  Description: `workerGroup` of latest run for the task, `_` if no run is exists for the task.
   * `workerId` is required  Description: `workerId` of latest run for the task, `_` if no run is exists for the task.
   * `provisionerId` is required  Description: `provisionerId` this task is targeted at.
   * `workerType` is required  Description: `workerType` this task must run on.
   * `schedulerId` is required  Description: `schedulerId` this task was created by.
   * `taskGroupId` is required  Description: `taskGroupId` this task was created in.
   * `reserved` Description: Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.

#### Artifact Creation Messages
 * `queueEvents.artifactCreated(routingKeyPattern) -> routingKey`
   * `routingKeyKind` is constant of `primary`  is required  Description: Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key.
   * `taskId` is required  Description: `taskId` for the task this message concerns
   * `runId` is required  Description: `runId` of latest run for the task, `_` if no run is exists for the task.
   * `workerGroup` is required  Description: `workerGroup` of latest run for the task, `_` if no run is exists for the task.
   * `workerId` is required  Description: `workerId` of latest run for the task, `_` if no run is exists for the task.
   * `provisionerId` is required  Description: `provisionerId` this task is targeted at.
   * `workerType` is required  Description: `workerType` this task must run on.
   * `schedulerId` is required  Description: `schedulerId` this task was created by.
   * `taskGroupId` is required  Description: `taskGroupId` this task was created in.
   * `reserved` Description: Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.

#### Task Completed Messages
 * `queueEvents.taskCompleted(routingKeyPattern) -> routingKey`
   * `routingKeyKind` is constant of `primary`  is required  Description: Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key.
   * `taskId` is required  Description: `taskId` for the task this message concerns
   * `runId` is required  Description: `runId` of latest run for the task, `_` if no run is exists for the task.
   * `workerGroup` is required  Description: `workerGroup` of latest run for the task, `_` if no run is exists for the task.
   * `workerId` is required  Description: `workerId` of latest run for the task, `_` if no run is exists for the task.
   * `provisionerId` is required  Description: `provisionerId` this task is targeted at.
   * `workerType` is required  Description: `workerType` this task must run on.
   * `schedulerId` is required  Description: `schedulerId` this task was created by.
   * `taskGroupId` is required  Description: `taskGroupId` this task was created in.
   * `reserved` Description: Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.

#### Task Failed Messages
 * `queueEvents.taskFailed(routingKeyPattern) -> routingKey`
   * `routingKeyKind` is constant of `primary`  is required  Description: Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key.
   * `taskId` is required  Description: `taskId` for the task this message concerns
   * `runId` Description: `runId` of latest run for the task, `_` if no run is exists for the task.
   * `workerGroup` Description: `workerGroup` of latest run for the task, `_` if no run is exists for the task.
   * `workerId` Description: `workerId` of latest run for the task, `_` if no run is exists for the task.
   * `provisionerId` is required  Description: `provisionerId` this task is targeted at.
   * `workerType` is required  Description: `workerType` this task must run on.
   * `schedulerId` is required  Description: `schedulerId` this task was created by.
   * `taskGroupId` is required  Description: `taskGroupId` this task was created in.
   * `reserved` Description: Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.

#### Task Exception Messages
 * `queueEvents.taskException(routingKeyPattern) -> routingKey`
   * `routingKeyKind` is constant of `primary`  is required  Description: Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key.
   * `taskId` is required  Description: `taskId` for the task this message concerns
   * `runId` Description: `runId` of latest run for the task, `_` if no run is exists for the task.
   * `workerGroup` Description: `workerGroup` of latest run for the task, `_` if no run is exists for the task.
   * `workerId` Description: `workerId` of latest run for the task, `_` if no run is exists for the task.
   * `provisionerId` is required  Description: `provisionerId` this task is targeted at.
   * `workerType` is required  Description: `workerType` this task must run on.
   * `schedulerId` is required  Description: `schedulerId` this task was created by.
   * `taskGroupId` is required  Description: `taskGroupId` this task was created in.
   * `reserved` Description: Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.

#### Task Group Resolved Messages
 * `queueEvents.taskGroupResolved(routingKeyPattern) -> routingKey`
   * `routingKeyKind` is constant of `primary`  is required  Description: Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key.
   * `taskGroupId` is required  Description: `taskGroupId` for the task-group this message concerns
   * `schedulerId` is required  Description: `schedulerId` for the task-group this message concerns
   * `reserved` Description: Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.




### Methods in `taskcluster.Secrets`
```python
import asyncio # Only for async 
import taskcluster
import taskcluster.aio

# Create Secrets client instance
secrets = taskcluster.Secrets(options)
# Below only for async instances, assume already in coroutine
loop = asyncio.get_event_loop()
session = taskcluster.aio.createSession(loop=loop)
asyncSecrets = taskcluster.aio.Secrets(options, session=session)
```
The secrets service provides a simple key/value store for small bits of secret
data.  Access is limited by scopes, so values can be considered secret from
those who do not have the relevant scopes.

Secrets also have an expiration date, and once a secret has expired it can no
longer be read.  This is useful for short-term secrets such as a temporary
service credential or a one-time signing key.
#### Ping Server
Respond without doing anything.
This endpoint is used to check that the service is up.


```python
# Sync calls
secrets.ping() # -> None
# Async call
await asyncSecrets.ping() # -> None
```

#### Set Secret
Set the secret associated with some key.  If the secret already exists, it is
updated instead.



Takes the following arguments:

  * `name`

Has required input schema

```python
# Sync calls
secrets.set(name, payload) # -> None
secrets.set(payload, name='value') # -> None
# Async call
await asyncSecrets.set(name, payload) # -> None
await asyncSecrets.set(payload, name='value') # -> None
```

#### Delete Secret
Delete the secret associated with some key.



Takes the following arguments:

  * `name`

```python
# Sync calls
secrets.remove(name) # -> None
secrets.remove(name='value') # -> None
# Async call
await asyncSecrets.remove(name) # -> None
await asyncSecrets.remove(name='value') # -> None
```

#### Read Secret
Read the secret associated with some key.  If the secret has recently
expired, the response code 410 is returned.  If the caller lacks the
scope necessary to get the secret, the call will fail with a 403 code
regardless of whether the secret exists.



Takes the following arguments:

  * `name`

Has required output schema

```python
# Sync calls
secrets.get(name) # -> result
secrets.get(name='value') # -> result
# Async call
await asyncSecrets.get(name) # -> result
await asyncSecrets.get(name='value') # -> result
```

#### List Secrets
List the names of all secrets.

By default this end-point will try to return up to 1000 secret names in one
request. But it **may return less**, even if more tasks are available.
It may also return a `continuationToken` even though there are no more
results. However, you can only be sure to have seen all results if you
keep calling `listTaskGroup` with the last `continuationToken` until you
get a result without a `continuationToken`.

If you are not interested in listing all the members at once, you may
use the query-string option `limit` to return fewer.


Has required output schema

```python
# Sync calls
secrets.list() # -> result
# Async call
await asyncSecrets.list() # -> result
```




### Methods in `taskcluster.WorkerManager`
```python
import asyncio # Only for async 
import taskcluster
import taskcluster.aio

# Create WorkerManager client instance
workerManager = taskcluster.WorkerManager(options)
# Below only for async instances, assume already in coroutine
loop = asyncio.get_event_loop()
session = taskcluster.aio.createSession(loop=loop)
asyncWorkerManager = taskcluster.aio.WorkerManager(options, session=session)
```
This service manages workers, including provisioning for dynamic worker pools.
#### Ping Server
Respond without doing anything.
This endpoint is used to check that the service is up.


```python
# Sync calls
workerManager.ping() # -> None
# Async call
await asyncWorkerManager.ping() # -> None
```

#### List Providers
Retrieve a list of providers that are available for worker pools.


Has required output schema

```python
# Sync calls
workerManager.listProviders() # -> result
# Async call
await asyncWorkerManager.listProviders() # -> result
```

#### Create Worker Pool
Create a new worker pool. If the worker pool already exists, this will throw an error.



Takes the following arguments:

  * `workerPoolId`

Has required input schema

Has required output schema

```python
# Sync calls
workerManager.createWorkerPool(workerPoolId, payload) # -> result
workerManager.createWorkerPool(payload, workerPoolId='value') # -> result
# Async call
await asyncWorkerManager.createWorkerPool(workerPoolId, payload) # -> result
await asyncWorkerManager.createWorkerPool(payload, workerPoolId='value') # -> result
```

#### Update Worker Pool
Given an existing worker pool definition, this will modify it and return
the new definition.

To delete a worker pool, set its `providerId` to `"null-provider"`.
After any existing workers have exited, a cleanup job will remove the
worker pool.  During that time, the worker pool can be updated again, such
as to set its `providerId` to a real provider.



Takes the following arguments:

  * `workerPoolId`

Has required input schema

Has required output schema

```python
# Sync calls
workerManager.updateWorkerPool(workerPoolId, payload) # -> result
workerManager.updateWorkerPool(payload, workerPoolId='value') # -> result
# Async call
await asyncWorkerManager.updateWorkerPool(workerPoolId, payload) # -> result
await asyncWorkerManager.updateWorkerPool(payload, workerPoolId='value') # -> result
```

#### Delete Worker Pool
Mark a worker pool for deletion.  This is the same as updating the pool to
set its providerId to `"null-provider"`, but does not require scope
`worker-manager:provider:null-provider`.



Takes the following arguments:

  * `workerPoolId`

Has required output schema

```python
# Sync calls
workerManager.deleteWorkerPool(workerPoolId) # -> result
workerManager.deleteWorkerPool(workerPoolId='value') # -> result
# Async call
await asyncWorkerManager.deleteWorkerPool(workerPoolId) # -> result
await asyncWorkerManager.deleteWorkerPool(workerPoolId='value') # -> result
```

#### Get Worker Pool
Fetch an existing worker pool defition.



Takes the following arguments:

  * `workerPoolId`

Has required output schema

```python
# Sync calls
workerManager.workerPool(workerPoolId) # -> result
workerManager.workerPool(workerPoolId='value') # -> result
# Async call
await asyncWorkerManager.workerPool(workerPoolId) # -> result
await asyncWorkerManager.workerPool(workerPoolId='value') # -> result
```

#### List All Worker Pools
Get the list of all the existing worker pools.


Has required output schema

```python
# Sync calls
workerManager.listWorkerPools() # -> result
# Async call
await asyncWorkerManager.listWorkerPools() # -> result
```

#### Report an error from a worker
Report an error that occurred on a worker.  This error will be included
with the other errors in `listWorkerPoolErrors(workerPoolId)`.

Workers can use this endpoint to report startup or configuration errors
that might be associated with the worker pool configuration and thus of
interest to a worker-pool administrator.

NOTE: errors are publicly visible.  Ensure that none of the content
contains secrets or other sensitive information.



Takes the following arguments:

  * `workerPoolId`

Has required input schema

Has required output schema

```python
# Sync calls
workerManager.reportWorkerError(workerPoolId, payload) # -> result
workerManager.reportWorkerError(payload, workerPoolId='value') # -> result
# Async call
await asyncWorkerManager.reportWorkerError(workerPoolId, payload) # -> result
await asyncWorkerManager.reportWorkerError(payload, workerPoolId='value') # -> result
```

#### List Worker Pool Errors
Get the list of worker pool errors.



Takes the following arguments:

  * `workerPoolId`

Has required output schema

```python
# Sync calls
workerManager.listWorkerPoolErrors(workerPoolId) # -> result
workerManager.listWorkerPoolErrors(workerPoolId='value') # -> result
# Async call
await asyncWorkerManager.listWorkerPoolErrors(workerPoolId) # -> result
await asyncWorkerManager.listWorkerPoolErrors(workerPoolId='value') # -> result
```

#### Workers in a specific Worker Group in a Worker Pool
Get the list of all the existing workers in a given group in a given worker pool.



Takes the following arguments:

  * `workerPoolId`
  * `workerGroup`

Has required output schema

```python
# Sync calls
workerManager.listWorkersForWorkerGroup(workerPoolId, workerGroup) # -> result
workerManager.listWorkersForWorkerGroup(workerPoolId='value', workerGroup='value') # -> result
# Async call
await asyncWorkerManager.listWorkersForWorkerGroup(workerPoolId, workerGroup) # -> result
await asyncWorkerManager.listWorkersForWorkerGroup(workerPoolId='value', workerGroup='value') # -> result
```

#### Get a Worker
Get a single worker.



Takes the following arguments:

  * `workerPoolId`
  * `workerGroup`
  * `workerId`

Has required output schema

```python
# Sync calls
workerManager.worker(workerPoolId, workerGroup, workerId) # -> result
workerManager.worker(workerPoolId='value', workerGroup='value', workerId='value') # -> result
# Async call
await asyncWorkerManager.worker(workerPoolId, workerGroup, workerId) # -> result
await asyncWorkerManager.worker(workerPoolId='value', workerGroup='value', workerId='value') # -> result
```

#### Create a Worker
Create a new worker.  The precise behavior of this method depends
on the provider implementing the given worker pool.  Some providers
do not support creating workers at all, and will return a 400 error.



Takes the following arguments:

  * `workerPoolId`
  * `workerGroup`
  * `workerId`

Has required input schema

Has required output schema

```python
# Sync calls
workerManager.createWorker(workerPoolId, workerGroup, workerId, payload) # -> result
workerManager.createWorker(payload, workerPoolId='value', workerGroup='value', workerId='value') # -> result
# Async call
await asyncWorkerManager.createWorker(workerPoolId, workerGroup, workerId, payload) # -> result
await asyncWorkerManager.createWorker(payload, workerPoolId='value', workerGroup='value', workerId='value') # -> result
```

#### Remove a Worker
Remove an existing worker.  The precise behavior of this method depends
on the provider implementing the given worker.  Some providers
do not support removing workers at all, and will return a 400 error.
Others may begin removing the worker, but it may remain available via
the API (perhaps even in state RUNNING) afterward.



Takes the following arguments:

  * `workerPoolId`
  * `workerGroup`
  * `workerId`

```python
# Sync calls
workerManager.removeWorker(workerPoolId, workerGroup, workerId) # -> None
workerManager.removeWorker(workerPoolId='value', workerGroup='value', workerId='value') # -> None
# Async call
await asyncWorkerManager.removeWorker(workerPoolId, workerGroup, workerId) # -> None
await asyncWorkerManager.removeWorker(workerPoolId='value', workerGroup='value', workerId='value') # -> None
```

#### Workers in a Worker Pool
Get the list of all the existing workers in a given worker pool.



Takes the following arguments:

  * `workerPoolId`

Has required output schema

```python
# Sync calls
workerManager.listWorkersForWorkerPool(workerPoolId) # -> result
workerManager.listWorkersForWorkerPool(workerPoolId='value') # -> result
# Async call
await asyncWorkerManager.listWorkersForWorkerPool(workerPoolId) # -> result
await asyncWorkerManager.listWorkersForWorkerPool(workerPoolId='value') # -> result
```

#### Register a running worker
Register a running worker.  Workers call this method on worker start-up.

This call both marks the worker as running and returns the credentials
the worker will require to perform its work.  The worker must provide
some proof of its identity, and that proof varies by provider type.


Has required input schema

Has required output schema

```python
# Sync calls
workerManager.registerWorker(payload) # -> result
# Async call
await asyncWorkerManager.registerWorker(payload) # -> result
```




### Exchanges in `taskcluster.WorkerManagerEvents`
```python
import taskcluster

# Create WorkerManagerEvents client instance
workerManagerEvents = taskcluster.WorkerManagerEvents(options)
```
These exchanges provide notifications when a worker pool is created or updated.This is so that the provisioner running in a differentprocess at the other end can synchronize to the changes. But you are ofcourse welcome to use these for other purposes, monitoring changes for example.
#### Worker Pool Created Messages
 * `workerManagerEvents.workerPoolCreated(routingKeyPattern) -> routingKey`
   * `routingKeyKind` is constant of `primary`  is required  Description: Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key.
   * `reserved` Description: Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.

#### Worker Pool Updated Messages
 * `workerManagerEvents.workerPoolUpdated(routingKeyPattern) -> routingKey`
   * `routingKeyKind` is constant of `primary`  is required  Description: Identifier for the routing-key kind. This is always `'primary'` for the formalized routing key.
   * `reserved` Description: Space reserved for future routing-key entries, you should always match this entry with `#`. As automatically done by our tooling, if not specified.



<!-- END OF GENERATED DOCS -->
