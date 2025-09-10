import request from 'superagent';
import util from 'util';

const setTimeoutPromise = util.promisify(setTimeout);

/**
 * Retry a request call with the given URL and method.
 *
 * Responses with status 5xx are retried, and if 5 retries are exceeded then the last
 * response is returned.
 *
 * All other HTTP responses, including 4xx-series responses, are returned (not thrown).
 *
 * All other errors from superagent are thrown.
 */
export const throttleRequest = async ({ url, method, response = { status: 0 }, attempt = 1, delay = 100 }) => {
  if (attempt > 5) {
    return response;
  }

  let res;
  try {
    res = await throttleRequest.request(method, url);
  } catch (e) {
    if (e.status >= 400 && e.status < 500) {
      return e;
    }

    if (e.status >= 500) {
      const newDelay = 2 ** attempt * delay;
      return await setTimeoutPromise(newDelay, throttleRequest({
        url,
        method,
        response: e,
        attempt: attempt + 1,
        delay,
      }));
    }

    throw e;
  }
  return res;
};

// for overriding in testing..
throttleRequest.request = request;

export default {
  throttleRequest,
};
