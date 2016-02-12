TaskCluster-Lib-Testing
=======================

Support for testing TaskCluster components.

See the source for detailed documentation.

PulseTestReceiver
-----------------

A utility for tests written in mocha, that makes very easy to listen for a
specific message.

schemas
-------

Test schemas with a positive and negative test cases.

fakeauth
--------

A fake for the auth service to support testing APIs without requiring
production credentials, using Nock.

Intercept requests to the auth service's `authenticateHawk` method and
return a response based on clients, instead.  This is useful when testing
other API services.  Note that accessTokens are not checked -- the fake
simply controls access based on clientId or the scopes in a temporary
credential or supplied with authorizedScopes.

To start the mock, call `testing.fakeauth.start(clients)`.  Clients is on the form
```js
{
 "clientId1": ["scope1", "scope2"],
 "clientId2": ["scope1", "scope3"],
}
```

Call `testing.fakeauth.stop` in your test's `after` method to stop the HTTP interceptor.

Utilities
---------

The `sleep` function returns a promise that resolves after a delay.

The `poll` function will repeatedly call a function that returns a promise
until the promise is resolved without errors.

