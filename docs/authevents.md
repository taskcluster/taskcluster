# Auth Pulse Exchanges

##

The auth service, typically available at `auth.taskcluster.net`
is responsible for storing credentials, managing assignment of scopes,
and validation of request signatures from other services.

These exchanges provides notifications when credentials or roles are
updated. This is mostly so that multiple instances of the auth service
can purge their caches and synchronize state. But you are of course
welcome to use these for other purposes, monitoring changes for example.



## AuthEvents Client

```js
// Create AuthEvents client instance with default exchangePrefix:
// exchange/taskcluster-auth/v1/

const authEvents = new taskcluster.AuthEvents(options);
```

## Exchanges in AuthEvents Client

```js
// authEvents.clientCreated :: routingKeyPattern -> Promise BindingInfo
authEvents.clientCreated(routingKeyPattern)
```

```js
// authEvents.clientUpdated :: routingKeyPattern -> Promise BindingInfo
authEvents.clientUpdated(routingKeyPattern)
```

```js
// authEvents.clientDeleted :: routingKeyPattern -> Promise BindingInfo
authEvents.clientDeleted(routingKeyPattern)
```

```js
// authEvents.roleCreated :: routingKeyPattern -> Promise BindingInfo
authEvents.roleCreated(routingKeyPattern)
```

```js
// authEvents.roleUpdated :: routingKeyPattern -> Promise BindingInfo
authEvents.roleUpdated(routingKeyPattern)
```

```js
// authEvents.roleDeleted :: routingKeyPattern -> Promise BindingInfo
authEvents.roleDeleted(routingKeyPattern)
```