# taskcluster-lib-iterate
The motivation for this library is to provide a common framework for the running
of code many times in a robust and fail-safe manner.  At its core, this library
takes a chunk of code, runs it, waits a defined period of time, then runs it
again.  This library ensures that code run through it does not freeze, does not
fail too many times and does not fail silently.

## Example
Here is a simple example of this library:

```javascript
var Iterate = require(`./`);

i = new Iterate({
  maxFailures: 5,
  maxIterationTime: 10,
  watchDog: 5,
  waitTime: 2,
  handler: (watchDog, state) => {
    console.log(`do some work`);

    watchDog.touch(); // tell Iterate that we`re doing work still

    console.log(`still working`);
    watchDog.touch();

    return new Promise((res, rej) => {
      console.log(`Almost done`);
      watchDog.touch();
      setTimeout(res, 2);
    });
  },
});

// starting the iterator will invoke the handler immediately
i.start();

i.on(`stopped`, () => {
  console.log(`All done here!`);
});
```

## Options:
The constructor for the `Iterate` class takes an object.  The object interprets
the following properties:

* `maxIterationTime`: the absolute upper bounds for an iteration interval, in
  seconds.  This time is exclusive of the time we wait between iterations.
* `watchDog`: this is the number of seconds to wait inside the iteration
  before marking as a failure.
* `handler`: promise returning function which contains work to execute.
  Is passed in a `watchDog` and a `state` object reference.  The `watchDog`
  object has `.touch()` to mark when progress is made and should be reset and a
  `.stop()` in case you really don't care about it.  The state object is
  initially empty but can be used to persist information between calls to the
  handler.
* `waitTime`: number of seconds between the conclusion of one iteration
  and commencement of another.
* `maxIterations` (optional, default infinite): Complete up to this many
  iterations and then successfully exit.  Failed iterations count.
* `maxFailures` (optional, default 7): When this number of failures occur
  in consecutive iterations, treat as an error
* `minIterationTime` (optional): If not at least this number of seconds
  have passed, treat the iteration as a failure
* `waitTimeAfterFail` (optional, default waitTime): If an iteration fails,
  wait a different amount of seconds before the next iteration (currently not
  implemented)
* `monitor` (optional): instance of `taskcluster-lib-monitor` prefix with a
  name appropriate for this iterate instance.

The code to run is called a handler.  A handler is a function which returns a
promise (e.g. async function).  This function is passed in the arguments
`(watchdog, state)`.

The `watchdog` parameter is basically a ticking timebomb.  It has methods
`.start()`, `.stop()` and `.touch()` and emits `started`, `expired`, `stopped`
and `touched`.  What it allows an implementor is the abilty to say that while
the absolute maximum iteration interval (`maxIterationTime`), incremental
progress should be made.  The idea here is that after each chunk of work in the
handler, you run `.touch()`.  This way, you can have a handler that can be
marked as failing without waiting the full `maxIterationTime`.  The delay for
this watch dog is the `watchDog` property on the constructor options.

The `state` parameter is an object that is passed in to the handler function.
It allows each iteration to accumulate data and use on following iterations.
Because this object is passed in by reference, changes to properties on the
object are saved, but reassignment of the state variable will not be saved. In
other words, do `state.data = {count: 1}` and not `state = {count:1}`.

## Events

Iterate is an event emitter.  When relevant events occur, the following events
are emitted.  If the `error` event does not have a listener, the process will
exit with a non-zero exit code when it would otherwise be emitted.

* `started`: when overall iteration starts
* `stopped`: when overall iteration is finished
* `completed`: only when we have a max number of iterations, when we
  finish the last iteration
* `iteration-start`: when an individual iteration starts
* `iteration-success`: when an individual iteration completes with
  success.  provides the value that handler resolves with
* `iteration-failure`: provides iteration error
* `iteration-complete`: when an iteration is complete regardless of outcome
* `error`: when the iteration is considered to be concluded and provides
  list of iteration errors.  If there are no handlers and this event is
  emitted, an exception will be thrown in a process.nextTick callback.

## TODO
There are a couple things that I`d like to do to this library

* implement `waitTimeAfterFail` functionality
* use events internally so that all error handling is done with the same code
* emit events like `stopped-success` and `stopped-failure` to make handling shut
  down easier.  Right now, we emit `stopped` on success and `stopped` *and*
  `error` on failure.  We should either emit only one of `stopped` and `error`
  or have the above mentioned events
