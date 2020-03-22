const request = require('superagent');
const util = require('util');

const setTimeoutPromise = util.promisify(setTimeout);

const throttleRequest = async ({url, method, delay = 10, response = {status: 0}, attempt = 1}) => {
  if (attempt > 5) {
    return response;
  }

  let res;
  try {
    res = await request(method, url);
  } catch (e) {
    if (e.status >= 400 && e.status < 500) {
      return e;
    }
    if (e.status >= 500) {
      const newDelay = 2 ** attempt * 100;
      /* eslint-disable comma-dangle */
      return await setTimeoutPromise(
        newDelay,
        throttleRequest({url, method, delay: newDelay, response: e, attempt: attempt + 1})
      );
      /* eslint-enable comma-dangle */
    }
  }
  return res;
};

module.exports = {
  throttleRequest,
};
