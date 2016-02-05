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
production credentials, using Nock.  In many cases, this is easier to use thatn
`createMockAuthServer`, as it does not check accessTokens and doesn't require
customizing the auth URL.

Utilities
---------

The `sleep` function returns a promise that resolves after a delay.

The `poll` function will repeatedly call a function that returns a promise
until the promise is resolved without errors.

