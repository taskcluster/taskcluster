TaskCluster-Lib-Testing
=======================

Support for testing TaskCluster components.

This module contains a number of utilities that facilitate testing TaskCluster
components.  It is typically installed as a devDependency, so it is not used in
production code.

See the source for detailed documentation.

PulseTestReceiver
-----------------

A utility for tests written in mocha, that makes it very easy to wait for a
specific pulse message.  This uses real pulse messages, so pulse credentials
will be required.

**Example:**
```js
suite("MyTests", function() {
  let credentials = {
    username:     '...',  // Pulse username
    password:     '...'   // Pulse password
  };
  let receiver = new testing.PulseTestReceiver(credentials, mocha)

  test("create task message arrives", async function() {
    var taskId = slugid.v4();

    // Start listening for a message with the above taskId, giving
    // it a local name (here, `my-create-task-message`)
    await receiver.listenFor(
      'my-create-task-message',
      queueEvents.taskCreated({taskId: taskId})
    );

    // We are now listen for a message with the taskId
    // So let's create a task with it
    await queue.createTask(taskId, {...});

    // Now we wait for the message to arrive
    let message = await receiver.waitFor('my-create-task-message');
  });
});
```

The `receiver` object will setup an PulseConnection before all tests and close
the PulseConnection after all tests. This should make tests run faster.  All
internal state, ie. the names given to `listenFor` and `waitFor` will be reset
between all tests.

schemas
-------

Test schemas with a positive and negative test cases.

The method should be called within a `suite`, as it will call the mocha `test`
function to define a test for each schema case.

 * `validator` - {}  // options to pass to the [taskcluster-lib-validate](https://github.com/taskcluster/taskcluster-lib-validate) constructor
 * `cases` - array of test cases
 * `basePath` -  base path for relative pathnames in test cases (default `path.join(__dirname, 'validate')`)
 * `schemaPrefix` - prefix used to resolve schema references; usually `http://schemas.taskcluster.net`

Each test case looks like this:

```js
{
  schema:   'svc/v7/frobnicate-foo.json', // JSON schema identifier to test against (appended to schemaPrefix)
  path:     'test-file.json',             // Path to test file (relative to basePath)
  success:  true || false                 // true if validation should succeed; false if it should fail
}
```

fakeauth
--------

A fake for the auth service to support testing APIs without requiring
production credentials, using Nock.

This object intercepts requests to the auth service's `authenticateHawk` method
and return a response based on the given `clients`, instead. Note that
accessTokens are not checked -- the fake simply controls access based on
clientId or the scopes in a temporary credential or supplied with
authorizedScopes.

To start the mock, call `testing.fakeauth.start(clients)` in your suite's
`setup` method. Clients has the form

```js
{
 "clientId1": ["scope1", "scope2"],
 "clientId2": ["scope1", "scope3"],
}
```

Call `testing.fakeauth.stop()` in your test suite's `teardown` method to stop the HTTP interceptor.

Utilities
---------

### Sleep

The `sleep` function returns a promise that resolves after a delay.

**NOTE** tests that depend on timing are notoriously unreliable, and suggest
poorly-isolated tests. Consider writing the tests to use a "fake" clock or to
poll for the expected state.

### Poll

The `poll` function will repeatedly call a function that returns a promise
until the promise is resolved without errors.

