const Debug = require('debug');
const debug = Debug('taskcluster-lib-testing:poll');
const sleep = require('./sleep');

/**
 * Poll a function that returns a promise until the promise is resolved without
 * errors. Poll `iterations` number of times, with `delay` ms in between.
 *
 * Defaults to 20 iterations with a delay of 250 ms (total of four seconds).
 *
 * Return a promise that a promise form the `poll` function resolved without
 * error. This will return the first successful poll, and stop polling.
 */
var poll = function(doPoll, iterations, delay) {
  delay = delay || 250;
  iterations = iterations === undefined ? 20 : iterations;
  return doPoll().catch(function(err) {
    // Re-throw
    if (iterations !== undefined && iterations <= 0) {
      throw err;
    }
    debug(`ignoring error while polling: ${err}`);
    return sleep(delay).then(function() {
      return poll(doPoll, iterations - 1, delay);
    });
  });
};

module.exports = poll;
