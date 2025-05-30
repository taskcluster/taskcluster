# Monitor Library

A convenient library to wrap up all of the pieces needed for a Taskcluster service to record metrics, write structured logs, and expose Prometheus metrics.
By default it will report any errors that cause the process to exit, and report as warnings any errors that cause stats writing to not work.
To disable any of these, you can see the Options and Defaults section below.

Taskcluster has some generic concepts that are able to be monitored easily using utility functions in this package.
The Usage section lists these cases and shows how to use this package to measure them.

## Usage

This library is initialized early in the Node process's lifetime, while modules are still being loaded.
At this time, the static method `MonitorManager.register` can be called to register new log message types:

```js
import { MonitorManager } from 'taskcluster-lib-monitor';

MonitorManager.register({
  name: 'somethingHappened',
  title: 'Something Happened',
  type: 'something-happened',
  version: 1,
  level: 'info',
  description: 'A thing, it has occurred.',
  fields: {
    thing: 'The thing in question',
  },
});
```

Typically, message types are registered in the module where they are produced.
Where multiple modules in a service produce the same message, those can be declared in `src/monitor.js` and that file required from `src/main.js`.
Other Taskcluster libraries also register message types for messages that they send.

Once the service begins running, call the `setup` method on the monitor manager to get the "root" monitor instance.
This is typically done in a loader component:

```js
  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => MonitorManager.setup({
      serviceName: 'some-service',
      processName: process,
      verify: profile !== 'production',
      prometheusConfig: {
        // Optional Prometheus configuration
        prefix: 'tc', // Optional prefix for all metrics
        server: {
          port: 9100,          // Port for Prometheus metrics server
          ip: '0.0.0.0',       // IP to bind server to (default 127.0.0.1)
        },
        // Optional PushGateway configuration for short-lived processes
        push: {
          gateway: 'http://pushgateway:9091',
          jobName: 'my-service-job',
          groupings: { environment: 'production' },
        },
      },
      ...cfg.monitoring,
    }),
  },
```

That monitor can then be used to log, measure, count, or even create child monitors.

Typically the log references are passed to an instance of `taskcluster-lib-references`.

### register

This library allows creating custom message types, and documents those in the service documentation.
To add a message type, do the following:

```js
MonitorManager.register({
  name: 'email',
  title: 'Email Request',
  type: 'email',
  version: 1,
  level: 'info',
  description: 'A request to send an email.',
  fields: {
    address: 'The requested recepient of the email.',
  },
});

MonitorManager.register({
  name: 'errorReport',
  title: 'Error Report',
  type: 'error-report',
  version: 1,
  level: 'any', // Notice that this is `any`
  description: 'A generic error report.',
  fields: {
    stack: 'A stack trace.',
  },
});
```

Given the above, the log message can be generated with

```js
monitor.log.email({address: req.body.address});
// An example with an `any` level
monitor.log.errorReport({stack: '...'}, {level: 'warning'});
```

The options to `register` are:

 * `name` - This will be made available on your monitor under a `.log` prefix.
 * `type` - This will be the `Type` field of the logged message.
 * `version` - This will end up in a `v` field of the `Fields` part of a logged message. Bump this if making a backwards-incompatible change
 * `level` - This will be the level that this message logs at. This must either be a syslog level or `any`. If it is `any`, you must pass an object with the
    field `level` as the second argument to the logging function.
 * `description` - A description of what this logging message means
 * `fields` - An object where every key is the name of a required field to be logged. Corresponding values are documentation of the meaning of that field.
 * `serviceName` - If set, then this log type appears only on this service; otherwise the log type is considered generic to all services.

If the `verify` option is set to true during manager setup, this library will verify that at least the required fields have been passed into the logger
upon invoking it.

### registerMetric

Similar to message types, you can register metrics that will be exposed to Prometheus:

```js
MonitorManager.registerMetric({
  name: 'api_request_duration_seconds',
  type: 'histogram',
  description: 'API request duration in seconds',
  labels: {
    method: 'Method name',
    path: 'Request path',
    status: 'Response status',
  },
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5], // Buckets for histogram
  serviceName: null, // null means this is a global metric
});

MonitorManager.registerMetric({
  name: 'active_users',
  type: 'gauge',
  description: 'Number of active users',
  serviceName: 'auth-service', // Specific to this service
});

MonitorManager.registerMetric({
  name: 'api_requests_total',
  type: 'counter',
  description: 'Count of API requests',
  labels: {
    method: 'HTTP verb',
    status: 'Response status code',
  },
});

MonitorManager.registerMetric({
  name: 'request_processing_time',
  type: 'summary',
  description: 'Summary of request processing time',
  labels: { endpoint: 'Endpoint' },
  percentiles: [0.5, 0.9, 0.95, 0.99], // Optional percentiles for summaries
  registers: ['default', 'special'], // allow metric to be present in multiple registries
});
```

The options to `registerMetric` are:

 * `name` - Name of the metric. Should follow Prometheus naming conventions.
 * `type` - One of 'counter', 'gauge', 'histogram', or 'summary'.
 * `description` - A description of what this metric measures.
 * `labels` - (Optional) Object of label names that can be applied to this metric and their descriptions.
 * `buckets` - (Optional, for 'histogram' type) Array of bucket boundaries.
 * `percentiles` - (Optional, for 'summary' type) Array of percentiles to calculate.
 * `serviceName` - (Optional) If set, then this metric appears only on this service; otherwise the metric is considered global.
 * `registers` - (Optional) Array of registry names to use, defaults is `['default']`. This allows to separate metrics if they need to be published separately.

### setup

The available options to the setup function are:

 * `serviceName` - The name of the service
 * `level` - A syslog logging level. Any messages with less severity than this level will not be logged.
 * `patchGlobal` - If true (the default), any uncaught errors in the service will be reported.
 * `processName` - If set to a string that identifies this process, cpu and memory
    usage of the process will be reported on an interval.
 * `resourceInterval` - The interval (in seconds) on which to report process resources
 * `bailOnUnhandledRejection` - If true, exit the process when an unhandled rejection occurs (the default)
 * `fake` - If true, the monitoring object will be a fake that stores data for testing
 * `metadata` - an object of extra fields to attach to any logs generated by this object. If one field is `traceId`, it is bumped to the top-level of the log.
 * `debug` - If true, logging output will be sent to the `debug` log in a human-readable format
 * `destination` - A stream to which formatted logs should be written.
 * `verify` - If this is true, log messages that have been registered will be verified to define all of the required fields.
 * `errorConfig` - An optional object containing a `reporter` field and any arguments to pass to a reporter. See below.
 * `prometheusConfig` - An optional object containing Prometheus configuration. See below.

### Error Configuration

This library supports pluggable error reporting. At the current time, the only supported plugin is `SentryReporter`. This will
send any errors reported through `monitor.reportError()` (including crashes and unhandled rejections) to a sentry instance. It
takes a single configration value of `dsn` which must be supplied.

```
errorConfig: {
  reporter: 'SentryReporter',
  dsn: '...',
},
```

### Prometheus Configuration

This library supports Prometheus metrics through the `prometheusConfig` option. The configuration object supports:

```js
prometheusConfig: {
  // Optional prefix for all metrics
  prefix: 'fxci',

  // Optional server configuration for exposing metrics to Prometheus
  server: {
    port: 9100,        // Default Prometheus port
    ip: '0.0.0.0',     // Listen on all interfaces (default: '127.0.0.1')
  },

  // Optional PushGateway configuration for short-lived processes
  push: {
    gateway: 'http://pushgateway:9091',  // URL of your Prometheus PushGateway
    jobName: 'periodic-task',            // Optional name (defaults to serviceName)
    groupings: {                         // Optional additional labels
      instance: 'worker-1',
      environment: 'production',
    },
  },
}
```

The Prometheus server exposes the following endpoints:
- `/metrics` - Returns Prometheus-formatted metrics
- `/health` - A simple health check endpoint

## Monitor objects

Monitor objects are intended to be passed around to the various things that might need to submit data for monitoring.
The `setup` function returns a "root" monitor, and other "child" monitors can be created from the root.

To create a child monitor, call `monitor.childMonitor(name, metadata)`.
The `name` if given will be appended to the parent monitor's name.
The `metadata`, if given, will be included in the fields of any logs generated by this object, in addition to the parent monitor's metadata.
At least one of `name` and `metadata` must be given.
The messages these child monitors produce will have a value of `Logger` corresponding to their full name.

### Prometheus Metrics Methods

If Prometheus is enabled, monitor instances provide the following methods for metrics:

```js
// Increment a counter
monitor.increment('api_requests_total', 1, { method: 'GET', status: '200' });

// Decrement a gauge
monitor.decrement('active_connections', 1);

// Set a gauge to a specific value
monitor.set('active_users', 42);

// Observe a value for a histogram or summary
monitor.observe('request_duration_seconds', 0.157, { path: '/api/v1/task' });

// Start a timer and get a function to end it
const end = monitor.startPromTimer('api_request_duration_seconds', { method: 'POST' });
// ... do some work ...
const durationSeconds = end({ status: 'success' }); // Add more labels at end time
```

### Exposing Metrics

Metrics are exposed after you have configured either a metrics server or a push gateway and explicitly started the exposure process.

Call `exposeMetrics()` on a monitor instance to start the configured exposure mechanism. The first call initiates the setup (server start or gateway connection) and should be made only once.

If you manage multiple sets of metrics (e.g., for different components or jobs), you can expose a specific set by passing its identifier (a string) to `exposeMetrics(identifier)`.

```js
const childMonitor = monitor.childMonitor('queue-metrics');
childMonitor.exposeMetrics('totals'); // Start exposing metrics from the 'totals' registry
```

### Logging

A monitor instance provides the following functions:

```js
  emerg(type, fields) // Not recommended for use
  alert(type, fields)
  crit(type, fields)
  err(type, fields)
  warning(type, fields)
  notice(type, fields)
  info(type, fields)
  debug(type, fields)
```

If you leave out `type`, the first argument will be used for `fields`.
If fields is a string or number, we will log it in a generic message.
If fields contains a `traceId` key, it will be moved to the top-level of the log structure.
If fields contains a `requestId` key, it will be moved to the top-level of the log structure.
This is useful for something like simple debug logging, that can be enabled in production when necessary.
For example,

```js
monitor.debug('Whatever you want to say');
```

results in

```
{Fields: {message: 'Whatever you want to say'}, ...}
```

### Measuring and Counting Things

**Note: You should prefer logging specific types or using the Prometheus metrics methods rather than these generic counts and measures. They exist mostly for backwards compatibility.**

To record a current measurement of a named value:

```js
monitor.measure('foo', 10);
```

To increment the count of some value:

```js
monitor.count('bar');
monitor.count('bar', 4); // increment by 4
```

These events will have types of `monitor.measure` and `monitor.count` respectively. The fields will have `key` and `val`.

If Prometheus is enabled, these calls will also automatically update corresponding Prometheus metrics.

### Reporting Errors

There are lots of options for reporting errors:

```js
// Report error as a string
monitor.reportError('Something went wrong!');
// Report error (from catch-block or something like that)
monitor.reportError(new Error("..."));
// Report an error with extra info
monitor.reportError(new Error("..."), {foo: 'bar'});
// (DEPRECATED) Report error as a warning. This will simply append 'warning' to fields
monitor.reportError(new Error("..."), 'warning');
```

The "extra" information is passed to the error reporting plugin and may appear there as "tags".

The Sentry error reporter will look for a `sentryFingerprint` property on any reported errors, and send that string to Sentry along with the default fingerprint.
See [the Sentry docs](https://docs.sentry.io/platforms/javascript/data-management/event-grouping/sdk-fingerprinting/#group-errors-with-greater-granularity) for details.

### Monitoring CPU & Memory

```js
// Begin monitoring CPU & Memory
const stopMonitor = monitor.resources('web');
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
const root = monitor.timer('compute-sqrt', () => {
  return Math.sqrt(25);
})
assert(root === 5);

// Timing a single asynchronous function (promise)
const task = await monitor.timer('load-task', queue.task(taskId));
assert(task.workerType == '...'); // task is the task definition response

// Timing an asynchronous function
const task = await monitor.timer('poll-for-task', async () => {
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
const handler = function(message) {
  console.log(message);
};

const consumer = libPulse.consume({..},
  monitor.timedHandler('pulse-listener', handler));
```

Specifically, `timedHandler` takes a function and wraps it with timing logic, returning a function with the same signature.

### Timing Arbitary Steps

If none of the above options are convenient for you, you can also just start and stop timers whenever you want.
A timer may only be started and measured once.
Any attempts over that will cause it to throw an Error.

```js
const doodad = monitor.timeKeeper('metricName', {optional: 'extra data'});
// Do some stuff here that takes some amount of time
// ...
// Keep doing stuff here however long you like
doodad.measure();
```

### Monitoring One-Shot Processes

Many Taskcluster services use one-shot processes to expire old data.  The
expectation is that these processes will be started at specific times, do their
business, and exit.  The `oneShot` method is designed to wrap such processs
with timing and error handling support.

```javascript
  'expire-info': {
    requires: ['cfg', 'monitor'],
    setup: ({cfg, monitor}) => {
      return monitor.oneShot('expire-info', () => {
        // do the expiration stuff
      });
    },
  },
```

This function will:
 * time the invocation, measured as `duration`
 * count the invocation if successful, measured as `done`
 * report any errors or promise rejections
 * shut down and flush monitoring
 * call `process.exit` on success or failure
Note, then, that the function **does not return**.

# Testing

If the `fake` option is true, then all messges logged are available from the `messages` property on the MonitorManager, in the format `{Type, Fields, Logger, Severity}`.
Setting this up is generally handled by the [Testing](../testing) library's `withMonitor` method.

The accumulated messages can be cleared with the `reset()` method.
This allows tests to assert that a message was logged correctly:

```js
assert.deepEqual(helper.monitor.messages.find(({Type}) => Type === 'task-claimed'), {
  Type: 'task-claimed',
  Fields: {...}
});
```
# Level Configuration

If you set the level during setup to a single valid syslog level, it will be propagated to all child loggers.
If you would like more control, you can use a specifically formatted string:

```
LEVEL='root:info api:debug handler:warning'
```

When you use this format, you specify a prefix _without_ `root` included and after a `:` you specify a valid syslog level.
You _must_ set a value for `root` in these cases and any unspecified prefixes will default to that.

# Mesage Format

This library writes logs to stdout in the [mozlog](https://wiki.mozilla.org/Firefox/Services/Logging) format.

We add an extra `message` field to the top level if any of the contents of `Fields` are `message` or `stack`.
This is for compatibility with the logging tools we use. We will add configurable output formats later if wanted.

We have both a `Severity` and `severity` field to support both our logging tooling requiremtents and mozlog's.
The lowercase property reports in a string version of severity and uppercase is the syslog number for each level.

We also add a `serviceContext` which is used in our tooling.
This contains a single field with the name of the service, and the version.

The result looks like this:

```json
{
  "Timestamp": <time since unix epoch in nanoseconds>,
  "Type": "...",
  "Logger": "...",
  "message": "...",
  "serviceContext": {"service": "..."},
  "Hostname": "...",
  "EnvVersion": "2.0",
  "Severity": ...,
  "severity": ...,
  "Pid": ...,
  "Fields": {...}
}
```

The `type` will be set in the event object as the `Type` field in the mozlog format.
Everything in `fields` will be set in the `Fields`.
We default to `info` logging level so normally `debug` logs will not be logged.
