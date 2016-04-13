TaskCluster Metrics and Monitoring Library
==========================================

[![Build Status](https://travis-ci.org/taskcluster/taskcluster-lib-monitor.svg?branch=master)](https://travis-ci.org/taskcluster/taskcluster-lib-monitor)

A convenient library to wrap up all of the pieces needed for a taskcluster service to record metrics with Statsum and report errors with Sentry.

Requirements
------------

This is tested on and should run on any of node `{0.12, 4, 5}`.

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

monitor.measure('foo', 10);
monitor.count('bar', 1);
await monitor.flush();

monitor.reportError('Something went wrong!');
```

More details on the usage of measure and count can be found at [the statsum client](https://github.com/taskcluster/node-statsum#statsum-client-for-nodejs).

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
```

Testing
-------

`npm install` and `npm test`. You can set `DEBUG=taskcluster-lib-monitor,test` if you want to see what's going on. There are no keys required to test this library.

License
-------

[Mozilla Public License Version 2.0](https://github.com/taskcluster/taskcluster-lib-monitor/blob/master/LICENSE)
