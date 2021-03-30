const got = require('got');

module.exports = async (url, options) => {
  try {
    const response = await got(url, { retry: 5, ...options });
    return response.body;
  }
  catch (e) {
    console.error(`error retrieving artifact. ${e} URL: ${url}`);
    // temporary debugging - https://github.com/taskcluster/taskcluster/issues/4673
    console.error(`e.code: ${e.code}`);
    console.error(`options: ${JSON.stringify(options, null, 2)}`);
    if (e.response && e.response.statusCode) {
      // if we got an HTTP response, we don't need the temporary debugging
      console.error(`e.response.statusCode: ${e.response.statusCode}`);
      return null;
    }
    console.error('e:', e);

    return null;
  }
};
