/**
 * Retry assertion failures in the given async function, waiting 100ms
 * between tries.  This is useful for testing the auth service, which does
 * not offer immediate use-after-write consistency for clients and roles.
 */
exports.retryAssertionFailures = async (times, utils, fn) => {
  for (let tries = 1; tries <= times; tries++) {
    try {
      await fn();
    } catch (err) {
      if (tries === times || err.code !== 'ERR_ASSERTION') {
        throw err;
      }

      utils.status({message: `Try ${tries} failed; waiting 100ms`});
      await new Promise(res => setTimeout(res, 100));
      continue;
    }

    // success!
    break;
  }
};
