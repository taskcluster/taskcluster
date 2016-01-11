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

Mock Auth API
-------------

The `createMockAuthServer` function creates a mock authentication server for
testing, implementing the `azureTableSAS` and `authenticateHawk` methods using
a static list of clients and keys.  `createMockAuthServer.mockAuthApi` is the
TaskCluster API instance.

Utilities
---------

The `sleep` function returns a promise that resolves after a delay.

The `poll` function will repeatedly call a function that returns a promise
until the promise is resolved without errors.
