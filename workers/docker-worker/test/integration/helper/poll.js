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
const poll = async (doPoll, iterations, delay) => {
  delay = delay || 250;
  iterations = iterations === undefined ? 20 : iterations;
  const errors = [];
  const start = +new Date();

  for (;;) {
    try {
      return await doPoll();
    } catch (err) {
      errors.push({err, when: new Date() - start});

      // Re-throw unless we're out of iterations
      if (iterations !== undefined && iterations <= 0) {
        const err = new Error(
          'Polling iterations exceeded.  Errors ignored during polling:\n' +
          errors.map(({err, when}) => `${when}ms from start: ${err}`.trim()).join('\n---\n'));
        throw err;
      }
      iterations--;

      debug(`ignoring error while polling: ${err}`);
      await sleep(delay);
    }
  }
};

module.exports = poll;
