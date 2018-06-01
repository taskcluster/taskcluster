const assert = require('assert');

/**
 * A poor man's "assert.rejects", since assert.rejects was only introduced
 * in Node 10
 */
exports.assert_rejects = async (promise, messageRegexp) => {
  let err;

  try {
    await promise;
  } catch (e) {
    err = e;
  }
  if (!err) {
    throw new assert.AssertionError({
      message: 'Did not get expected error',
    });
  }
  if (!err.toString().match(messageRegexp)) {
    throw err;
  }
};
