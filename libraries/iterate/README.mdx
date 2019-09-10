# Iterate Library

The motivation for this library is to provide a common framework for the running
of code many times in a robust and fail-safe manner.  At its core, this library
takes a chunk of code, runs it, waits a defined period of time, then runs it
again.  This library ensures that code run through it does not freeze, does not
fail too many times and does not fail silently.

## Example
Here is a simple example of this library:

```javascript
var Iterate = require(`taskcluster-lib-iterate`);

i = new Iterate({
  name: 'something',
  maxFailures: 5,
  monitor,
  maxIterationTime: 10000,
  watchdogTime: 5000,
  waitTime: 2000,
  handler: async watchdog => {
    await doSomeWork();
    watchdog.touch();  // tell Iterate that we`re doing work still
    await doMoreWork();
    watchdog.touch();
  },
});

// starting the iterator will invoke the handler immediately, but returns before
// the iteration is complete.
i.start();

i.on(`stopped`, () => {
  console.log(`All done here!`);
});
```

## Options:

The constructor for the `Iterate` class takes an options object, with the following properties.
All times are in milliseconds.

* `name`: A name used for reporting
* `monitor`: An instance of taskcluster-lib-monitor
* `handler`: the async function to call repeatedly, called as `await handler(watchdog)`.
  See details below.
* `monitor` (optional): instance of a `taskcluster-lib-monitor` instance with a name appropriate for this iterate instance.
  This is used to report errors.
* `maxIterationTime`: the maximum allowable duration of an iteration interval.
  An iteration longer than this is considered failed.
  This time is exclusive of the time we wait between iterations.
* `minIterationTime` (optional): the minimum allowable duration of an iteration interval.
  An iteration shorter than this is considered failed.
* `waitTime`: the time to wait between finishing an iteration and beginning the next.
* `maxIterations` (optional, default infinite): Complete up to this many
  iterations and then successfully exit.  Failed iterations count.
* `maxFailures` (optional, default 0): number of consecutive failures to tolerate before considering the iteration loop a failure by emitting an `error` event.
  Disabled if set to 0.
* `watchdogTime`: this is the time within which `watchdog.touch` must be called or the iteration is considered a failure.
  If this value is omitted or zero, the watchdog is disabled.

The main function of the `Iterate` instance is to call `handler` repeatedly.
This begins after a call to the `Iterate` instance's `start()` method, which returns a Promise that resolves once the first iteration begins (on the next tick).
To stop iteration, call the `stop()` method; this returns a Promise that resolves when any ongoing iterations are complete.

The handler is an async function, receiving one parameter -- `watchdog`.
This is basically a ticking timebomb that must be defused frequently by calling its `.touch()` method (unless it is not enabled).
It has methods `.start()`, `.stop()` and `.touch()` and emits `expired` when it expires.
What it allows an implementor is the abilty to say that within the absolute maximum iteration interval (`maxIterationTime`), incremental progress should be made.
The idea here is that after each chunk of work in the handler, you run `.touch()`.
If the `watchdogTime` duration elapses without a touch, then the iteration is considered faild.
This way, you can have a handler that can be marked as failing without waiting the full `maxIterationTime`.

If `maxFailures` is set, then the `Iterate` instance will emit an `error` event when the specified number of iteration failures have occurred with out intervening successful iterations.
This provides an escape from the situation where an application is "wedged" and some external action is required to restart it.
Typically, this entails exiting the process and allowing the hosting environment to automatically restart it.
Since all of the intervening failures were logged, this can be as simple as:

```js
iterator.on('error', () => {
  process.exit(1);
});
```

## Events

Iterate is an event emitter.  When relevant events occur, the following events
are emitted.  If the `error` event does not have a listener, the process will
exit with a non-zero exit code when it would otherwise be emitted.

* `started`: when Iterate instance starts
* `stopped`: when Iterate instance has stopped
* `iteration-start`: when an individual iteration starts
* `iteration-success`: when an individual iteration completes successfully
* `iteration-failure`: when an individual iteration fails
* `iteration-complete`: when an iteration completes, regardless of outcome
* `error`: when the Iterate instance has failed (due to reaching maxFailures),
  containing the most recent error.
