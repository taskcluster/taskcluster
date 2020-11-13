const Debug = require('debug');
const fetch = require('node-fetch');

const debug = Debug('fetch');
// eslint-disable-next-line max-len
const JSON_CONTENT = /^(application\/(json|x-javascript)|text\/(x-)?javascript|x-json)(;.*)?$/;
const defaults = {
  retries: 2,
  delayFactor: 100,
  randomizationFactor: 0.25,
  maxDelay: 30 * 1000,
  timeout: 30 * 1000,
  headers: {
    'Content-Type': 'application/json',
  },
  method: 'GET',
  body: null,
};
const handleResponse = response =>
  Promise.resolve(response)
    .then(() =>
      JSON_CONTENT.test(response.headers.get('Content-Type'))
        ? response.json()
        : null,
    )
    .then(json => {
      if (response.ok) {
        return json;
      }

      const message =
        json && json.message
          ? json.message.split('---')[0]
          : response.statusText;

      return Promise.reject(
        Object.assign(new Error(message), {
          response,
          body: json,
        }),
      );
    });

module.exports = (url, opts = {}) => {
  const options = {
    ...defaults,
    ...opts,
  };

  // Only include the default headers on requests with a body, since
  // Content-Type only makes sense with a body and otherwise causes
  // issues with AWS signed URLs.
  const defaultHeaders = (options.body !== null) ? defaults.headers : {};
  options.headers = { ...defaultHeaders, ...opts.headers };

  const { delayFactor, randomizationFactor, maxDelay, retries } = options;

  return new Promise((resolve, reject) => {
    (function attempt(n) {
      debug(`${options.method} ${url}`);
      fetch(url, options)
        .then(handleResponse)
        .then(resolve)
        .catch(err => {
          if (err.response && err.response.status < 500) {
            // only retry on errors or 500-series responses
            reject(err);
          } else if (n > retries) {
            reject(err);
          } else {
            const delay = Math.min(
              (n - 1) ** 2 *
                delayFactor *
                (Math.random() * 2 * randomizationFactor +
                  1 -
                  randomizationFactor),
              maxDelay,
            );

            setTimeout(() => attempt(n + 1), delay);
          }
        });
    })(1);
  });
};
