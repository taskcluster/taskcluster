const realSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** An error that `withRetry` rethrows immediately, because retrying cannot change the outcome. */
export const fatal = message => Object.assign(new Error(message), { retriable: false });

/**
 * Call fn until it succeeds, with exponential backoff. Errors with
 * `retriable: false` are thrown immediately; they mean retrying cannot help.
 */
export const withRetry = async (
  fn,
  { attempts = 5, baseMs = 2000, sleep = realSleep, log = console.log, label = 'operation' } = {}
) => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (err.retriable === false || attempt >= attempts) {
        throw err;
      }
      const delay = baseMs * 2 ** (attempt - 1);
      log(`${label} failed (attempt ${attempt}/${attempts}): ${err.message}; retrying in ${delay}ms`);
      await sleep(delay);
    }
  }
};
