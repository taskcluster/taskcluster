const got = require('got');

module.exports = async (url, options) => {
  try {
    const response = await got(url, { retries: 5, ...options });
    return response.body;
  }
  catch (e) {
    console.error(`error retrieving artifact. ${e} URL: ${url}`);
    return null;
  }
};
