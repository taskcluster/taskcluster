# Authentication API

##

Authentication related API end-points for Taskcluster and related
services. These API end-points are of interest if you wish to:
  * Authorize a request signed with Taskcluster credentials,
  * Manage clients and roles,
  * Inspect or audit clients and roles,
  * Gain access to various services guarded by this API.

Note that in this service "authentication" refers to validating the
correctness of the supplied credentials (that the caller posesses the
appropriate access token). This service does not provide any kind of user
authentication (identifying a particular person).

### Clients
The authentication service manages _clients_, at a high-level each client
consists of a `clientId`, an `accessToken`, scopes, and some metadata.
The `clientId` and `accessToken` can be used for authentication when
calling Taskcluster APIs.

The client's scopes control the client's access to Taskcluster resources.
The scopes are *expanded* by substituting roles, as defined below.

### Roles
A _role_ consists of a `roleId`, a set of scopes and a description.
Each role constitutes a simple _expansion rule_ that says if you have
the scope: `assume:<roleId>` you get the set of scopes the role has.
Think of the `assume:<roleId>` as a scope that allows a client to assume
a role.

As in scopes the `*` kleene star also have special meaning if it is
located at the end of a `roleId`. If you have a role with the following
`roleId`: `my-prefix*`, then any client which has a scope staring with
`assume:my-prefix` will be allowed to assume the role.

### Guarded Services
The authentication service also has API end-points for delegating access
to some guarded service such as AWS S3, or Azure Table Storage.
Generally, we add API end-points to this server when we wish to use
Taskcluster credentials to grant access to a third-party service used
by many Taskcluster components.

## Auth Client

```js
// Create Auth client instance:

const auth = new taskcluster.Auth(options);
```

## Methods in Auth Client

```js
// auth.listClients :: [options] -> Promise Result
auth.listClients()
auth.listClients(options)
```

```js
// auth.client :: clientId -> Promise Result
auth.client(clientId)
```

```js
// auth.createClient :: (clientId -> payload) -> Promise Result
auth.createClient(clientId, payload)
```

```js
// auth.resetAccessToken :: clientId -> Promise Result
auth.resetAccessToken(clientId)
```

```js
// auth.updateClient :: (clientId -> payload) -> Promise Result
auth.updateClient(clientId, payload)
```

```js
// auth.enableClient :: clientId -> Promise Result
auth.enableClient(clientId)
```

```js
// auth.disableClient :: clientId -> Promise Result
auth.disableClient(clientId)
```

```js
// auth.deleteClient :: clientId -> Promise Nothing
auth.deleteClient(clientId)
```

```js
// auth.listRoles :: () -> Promise Result
auth.listRoles()
```

```js
// auth.role :: roleId -> Promise Result
auth.role(roleId)
```

```js
// auth.createRole :: (roleId -> payload) -> Promise Result
auth.createRole(roleId, payload)
```

```js
// auth.updateRole :: (roleId -> payload) -> Promise Result
auth.updateRole(roleId, payload)
```

```js
// auth.deleteRole :: roleId -> Promise Nothing
auth.deleteRole(roleId)
```

```js
// auth.expandScopesGet :: payload -> Promise Result
auth.expandScopesGet(payload)
```

```js
// auth.expandScopes :: payload -> Promise Result
auth.expandScopes(payload)
```

```js
// auth.currentScopes :: () -> Promise Result
auth.currentScopes()
```

```js
// auth.awsS3Credentials :: (level -> bucket -> prefix -> [options]) -> Promise Result
auth.awsS3Credentials(level, bucket, prefix)
auth.awsS3Credentials(level, bucket, prefix, options)
```

```js
// auth.azureAccounts :: () -> Promise Result
auth.azureAccounts()
```

```js
// auth.azureTables :: (account -> [options]) -> Promise Result
auth.azureTables(account)
auth.azureTables(account, options)
```

```js
// auth.azureTableSAS :: (account -> table -> level) -> Promise Result
auth.azureTableSAS(account, table, level)
```

```js
// auth.azureContainers :: (account -> [options]) -> Promise Result
auth.azureContainers(account)
auth.azureContainers(account, options)
```

```js
// auth.azureContainerSAS :: (account -> container -> level) -> Promise Result
auth.azureContainerSAS(account, container, level)
```

```js
// auth.sentryDSN :: project -> Promise Result
auth.sentryDSN(project)
```

```js
// auth.statsumToken :: project -> Promise Result
auth.statsumToken(project)
```

```js
// auth.webhooktunnelToken :: () -> Promise Result
auth.webhooktunnelToken()
```

```js
// auth.authenticateHawk :: payload -> Promise Result
auth.authenticateHawk(payload)
```

```js
// auth.testAuthenticate :: payload -> Promise Result
auth.testAuthenticate(payload)
```

```js
// auth.testAuthenticateGet :: () -> Promise Result
auth.testAuthenticateGet()
```

```js
// auth.ping :: () -> Promise Nothing
auth.ping()
```

