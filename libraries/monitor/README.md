TaskCluster Metrics and Monitoring Library
==========================================

[![Build Status](https://travis-ci.org/taskcluster/taskcluster-lib-monitor.svg?branch=master)](https://travis-ci.org/taskcluster/taskcluster-lib-monitor)
[![npm](https://img.shields.io/npm/v/taskcluster-lib-monitor.svg?maxAge=2592000)](https://www.npmjs.com/package/taskcluster-lib-monitor)
[![License](https://img.shields.io/badge/license-MPL%202.0-orange.svg)](http://mozilla.org/MPL/2.0)

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

This is tested on and should run on any of node `{8, 9, 10}`.

Usage
-----
This library must be provided with Taskcluster credentials that have the following scopes:

* `auth:sentry:<name of project>`
* `auth:statsum:<name of project>`

First, create a monitor by calling this module asynchronously.  This is typically
done in a [taskcluster-lib-loader](https://github.com/taskcluster/taskcluster-lib/loader)
component, but otherwise would look like:

```js
const mon = await monitor({
  rootUrl: 'https://taskcluster.example.com',
  credentials: cfg.taskcluster.credentials,
  projectName: 'taskcluster-foo',
  mock: cfg.monitor.mock,  // false in production, true in testing
  process: 'server',       // or otherwise for e.g., periodic tasks
});
```

The available options are:

 * `rootUrl` - the rootUrl for this Taskcluster instance; used with `credentials` to fetch statsum and sentry keys
 * `credentials`: `{clientId: '...', accessToken: '...'}` - Taskcluster credentials (no default - must be provided)
 * `projectName` - The project that will be written under to Statsum and Sentry.
 * `patchGlobal` - If true (the default), any uncaught errors in the service will be reported to Sentry.
 * `reportStatsumErrors` - If true (the default), any errors reporting to Statsum will be reported to Sentry.
 * `process` - If set to a string that identifies this process, cpu and memory
    usage of the process will be reported on an interval. Note: This can also be
    turned on by monitor.resources(...) later if wanted.  That allows for
    gracefully stopping as well.
 * `statsumToken` - a function that will return a Statsum token (`async (projectName) => {token, expires, baseUrl}`); the default value uses `credentials` to fetch a token from the Auth service.
 * `sentryDSN` - a function that will return a Sentry DSN (`async (projectName) => {dsn: {secret: '...'}, expires}`); the default value uses `credentials` to fetch a DSN from the Auth service.
 * `sentryOptions`:options given to the [raven.Client constructor](https://docs.sentry.io/clients/node/config/)
 * `mock` - If true, the monitoring object will be a fake that stores data for testing but does not report it (for testing).
 * `enable` - If false, the monitoring object will only report to the console (but not store data; for deployments without monitoring)
 * `aws` - If provided, these should be of the form `{credentials: {accessKeyId: '...', secretAccessKey: '...'}, region: '...'}`
 * `logName` - If provided, this should be the name of a AWS Kinesis stream that can be written to with the aws creds
 * `gitVersion` -  git version (for correlating errors); or..
 * `gitVersionFile` -  file containing git version (relative to app root)

### Measuring and Counting Things

More details on the usage of measure and count can be found at [the Statsum client](https://github.com/taskcluster/node-statsum#statsum-client-for-nodejs).

To record a current measurement of a named value:

```js
monitor.measure('foo', 10);
```

To increment the count of some value:

```js
monitor.count('bar');
monitor.count('bar', 4); // increment by 4
```

To construct an object capable of measuring and counting, but which adds a
prefix to the measured and counted names, use

```js
let thingMonitor = monitor.prefix('thing');
thing.measure('foo', 11);
thing.count('bar');
```

The monitor will automatically flush its statistics to statsum periodically, but you can force a flush with

```js
await monitor.flush();
```

### Reporting Errors

There are lots of options for reporting errors:

```js
// Report error as a string, without a stacktrace
monitor.reportError('Something went wrong!');
// Report error (from catch-block or something like that)
monitor.reportError(new Error("..."));
// Report error as a warning
monitor.reportError(new Error("..."), 'warning');
// Report error as info
monitor.reportError(new Error("..."), 'info');
// Report error as debug
monitor.reportError(new Error("..."), 'debug');
// Report an error with tags
monitor.reportError(new Error("..."), {foo: 'bar'});
// Report a warningr with tags
monitor.reportError(new Error("..."), 'warning', {foo: 'bar'});

```

### Monitoring CPU & Memory

```js
// Begin monitoring CPU & Memory
let stopMonitor = monitor.resources('web');
```
you can later call `stopMonitor()` to gracefully shut down the monitoring.

### Timing Functions/Promises

Often we wish to measure how long time an operation takes, synchronous or
asynchronous, this can done using the `monitor.timer(key, funcOrPromise)`
method. It takes a `key` (as name of the metric) and a function or promise to
measure the time of. If the function returns a promise, it'll include the time
it takes for the promise to resolve.

The following examples are valid usages:
```js
// Timing a synchronous operation
let root = monitor.timer('compute-sqrt', () => {
  return Math.sqrt(25);
})
assert(root === 5);

// Timing a single asynchronous function (promise)
let task = await monitor.timer('load-task', queue.task(taskId));
assert(task.workerType == '...'); // task is the task definition response

// Timing an asynchronous function
let task = await monitor.timer('poll-for-task', async () => {
  while (true) {
    try {
      return await queue.task(taskId);
    } catch (err) {
      // Ignore error and try again
      // In the real would you want a maximum time before you stop polling
      // And probably some sleeping between each polling attempt...
    }
  }
});
assert(task.workerType == '...'); // task is the task definition response

```

Rejected promises and errors will bubble up, and the time be will
measured and recoded just like successful functions or promises.

### Timing Handlers

A common pattern in Taskcluster projects is to have handler functions in a worker that take a message as an argument and perform some action. These
can be timed (in milliseconds) by wrapping them with `taskcluster-lib-monitor`:

```js
let monitor = await monitoring({
  projectName: 'tc-stats-collector',
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

Specifically, `timedHandler` takes a function and wraps it with timing logic, returning a function with the same signature.

### Express Timing Middleware

Most Taskcluster services are Express services. We can easily time how long endpoints take to respond to requests by inserting `taskcluster-lib-monitor`
as middleware:

```js
let monitor = await monitoring({
  projectName: 'tc-stats-collector',
  credentials: {clientId: 'test-client', accessToken: 'test'},
});

// Express setup, etc.

middleware.push(monitor.expressMiddleware('name_of_function'));
```
This is already integrated in `taskcluster-lib-api` and probably doesn't need to be implemented in your service on its own.


### Timing AWS SDK Calls

Oftentimes a lot of a service's time will be spent interacting with AWS services. These interactions can be measured
as in the following example:

```js
let aws = require('aws-sdk');
let ec2 = new aws.EC2({region: 'us-west-2'});
monitor.patchAWS(ec2);
await ec2.describeAvailabilityZones().promise().catch(err => {
  debug('Ignored ec2 error, we measure duration, not success, err: ', err);
});
```

### Timing Arbitary Steps
If none of the above options are convenient for you, you can also just start and stop timers whenever you want. A timer may
only be started and measured once. Any attempts over that will cause it to throw an Error.

```js
let doodad = monitor.timeKeeper('metricName');
// Do some stuff here that takes some amount of time
// ...
// Keep doing stuff here however long you like
doodad.measure();
```


###  Audit Logs
For the time being, this is restricted to services that have use AWS credentials directly rather than via accessing via the
auth service. Given a set of credentials that allow writing to a Kinesis stream and the name of that Kinesis stream, this will
allow writing arbitrary JSON blobs to that endpoint. The blobs will end up in S3 for permanent storage. We use this for things
like audit logs that we want to keep for a long time. Records must be less than 1MB when stringified.

```js
    let monitor = await monitoring({
      ...,
      aws: {credentials: {accessKeyId: 'foo', secretAccessKey: 'bar'}, region: 'us-east-1'},
      logName: 'audit-log-stream',
    });
    monitor.log({foo: 'bar', baz: 233}); // This will be submitted on a timed interval
    await monitor.flush(); // This will await all records being submitted
```

Testing
-------

`yarn install` and `yarn test`. You can set `DEBUG=taskcluster-lib-monitor,test` if you want to see what's going on. There are no keys required to test this library.

Hacking
-------

New releases should be tested on Travis to allow for all supported versions of Node to be tested. Once satisfied that it works, new versions should be created with
`yarn version` rather than by manually editing `package.json` and tags should be pushed to Github. Make sure to update [the changelog](https://github.com/taskcluster/taskcluster-lib-monitor/releases)!

License
-------

[Mozilla Public License Version 2.0](https://github.com/taskcluster/taskcluster-lib-monitor/blob/master/LICENSE)
