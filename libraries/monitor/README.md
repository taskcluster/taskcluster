TaskCluster Metrics and Monitoring Library
==========================================

[![Build Status](https://travis-ci.org/taskcluster/taskcluster-lib-monitor.svg?branch=master)](https://travis-ci.org/taskcluster/taskcluster-lib-monitor)

A convenient library to wrap up all of the pieces needed for a Taskcluster service to record metrics with Statsum and report errors with Sentry.
By default it will report any errors that cause the process to exit, and report as warnings any errors that cause stats writing to not work. To
disable any of these, you can see the Options and Defaults section below.

Process monitoring can be turned on by using the `monitor.resources(<process name>)` function where `<process name>` will generally end up
being something like `web` or `worker`.

Taskcluster has some generic concepts that are able to be monitored easily using utility functions in this package. The Usage section lists these
cases and shows how to use this package to measure them.

Changelog
---------
View the changelog on the [releases page](https://github.com/taskcluster/taskcluster-lib-monitor/releases).

Requirements
------------

This is tested on and should run on any of node `{0.12, 4, 5, 6}`.

Usage
-----
This library must be provided with Taskcluster credentials that have the following scopes:

* `auth:sentry:<name of project>`
* `auth:statsum:<name of project>`

```js
let monitor = await monitoring({
  project: 'tc-stats-collector',
  credentials: {clientId: 'test-client', accessToken: 'test'},
});

// Begin monitoring CPU & Memory
let stopMonitor = monitor.resources('web');

monitor.measure('foo', 10);
monitor.count('bar', 4);
monitor.count('bar'); // only passing in a key defaults the value to 1
await monitor.flush();

monitor.reportError('Something went wrong!');

// Report error (from catch-block or something like that)
monitor.reportError(new Error("..."));
// Report error as a warning
monitor.reportError(new Error("..."), 'warning');

// Gracefully shut down resource monitoring.
stopMonitor();
```

More details on the usage of measure and count can be found at [the Statsum client](https://github.com/taskcluster/node-statsum#statsum-client-for-nodejs).

### Timing Handlers

A common pattern in Taskcluster projects is to have handler functions in a worker that take a message as an argument and perform some action. These
can be timed by wrapping them with `taskcluster-lib-monitor`:

```js
let monitor = await monitoring({
  project: 'tc-stats-collector',
  credentials: {clientId: 'test-client', accessToken: 'test'},
});

let listener = new taskcluster.PulseListener({
  credentials: {clientId: 'test-client', accessToken: 'test'},
  queueName: 'a-queue-name',
});

let handler = function(message) {
  console.log(message);
};

listener.on('message', monitor.timedHandler('logging-listener', handler));
```

### Express Timing Middleware
Most Taskcluster services are Express services. We can easily time how long endpoints take to respond to requests by inserting `taskcluster-lib-monitor`
as middleware:

```js
let monitor = await monitoring({
  project: 'tc-stats-collector',
  credentials: {clientId: 'test-client', accessToken: 'test'},
});

// Express setup, etc.

middleware.push(monitor.expressMiddleware('name_of_function'));
```
This is already integrated in `taskcluster-lib-api` and probably doesn't need to be implemented in your service on its own.

Options and Defaults
--------------------

```js
// Taskcluster credentials have no default and must be provided.
credentials: {clientId: '...', accessToken: '...'}

// The project that will be written under to Statsum and Sentry.
// Must not be longer than 22 characters.
project: '<service-name>'

// If true, any uncaught errors in the service will be reported to Sentry.
patchGlobal: true

// If true, any errors reporting to Statsum will be reported to Sentry.
reportStatsumErrors: true

// If set to a string that identifies this process, cpu and memory usage of the process will be reported on an interval
// Note: This can also be turned on by monitor.resources(...) later if wanted. That allows for gracefully stopping as well.
process: null

// If true, the monitoring object will be a fake that stores data for testing
mock: false
```

Testing
-------

`npm install` and `npm test`. You can set `DEBUG=taskcluster-lib-monitor,test` if you want to see what's going on. There are no keys required to test this library.

Hacking
-------

New releases should be tested on Travis to allow for all supported versions of Node to be tested. Once satisfied that it works, new versions should be created with
`npm version` rather than by manually editing `package.json` and tags should be pushed to Github. Make sure to update [the changelog](https://github.com/taskcluster/taskcluster-lib-monitor/releases)!

License
-------

[Mozilla Public License Version 2.0](https://github.com/taskcluster/taskcluster-lib-monitor/blob/master/LICENSE)
