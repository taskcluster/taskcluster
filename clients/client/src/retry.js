/**
 * Call the given function based on the given retry configuration.  Each call to the
 * function is given a `retriableError` callback.  For retriable failures, call this
 * callback with an Error object (in case retries are exhausted) and return.  For
 * fatal errors, simply throw the error as usual.  The second argument is the attempt number.
 *
 * Note that as per the existing API, `retries` is the number of retries after the first
 * try; that is, a `retries` value of 3 means that `func` will be called 4 times.
 */
module.exports = async ({ retries, delayFactor, randomizationFactor, maxDelay }, func) => {
  let attempt = 0;

  while (true) {
    attempt += 1;

    let retriableError = null;

    const rv = await func(err => retriableError = err, attempt);
    if (!retriableError) {
      // success!
      return rv;
    }

    if (attempt > retries) {
      throw retriableError;
    }

    // Sleep for 2 * delayFactor on the first attempt, and 2x as long
    // each time thereafter
    let delay = Math.pow(2, attempt) * delayFactor;
    // Apply randomization factor
    let rf = randomizationFactor;
    delay *= Math.random() * 2 * rf + 1 - rf;
    // Always limit with a maximum delay
    delay = Math.min(delay, maxDelay);
    // Sleep before looping again
    await new Promise(accept => setTimeout(accept, delay));
  }
};
