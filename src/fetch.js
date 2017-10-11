import hawk from 'hawk';

const JSON_CONTENT = /^(application\/(json|x-javascript)|text\/(x-)?javascript|x-json)(;.*)?$/;
const defaults = {
  credentials: 'omit',
  retries: 5,
  delayFactor: 100,
  randomizationFactor: 0.25,
  maxDelay: 30 * 1000,
  timeout: 30 * 1000,
  headers: {
    'Content-Type': 'application/json'
  }
};

const handleResponse = response => Promise
  .resolve(response)
  .then(() => (JSON_CONTENT.test(response.headers.get('Content-Type')) ? response.json() : null))
  .then((json) => {
    if (response.ok) {
      return json;
    }

    const message = json.message ? json.message.split('---')[0] : response.statusText;

    return Promise.reject(Object.assign(new Error(message), {
      response,
      body: json
    }));
  });

export default (url, opts = {}) => {
  const options = { ...defaults, ...opts, headers: { ...(opts.body && defaults.headers), ...opts.headers } };
  const { delayFactor, randomizationFactor, maxDelay, retries } = options;

  if (typeof options.credentials !== 'string') {
    const header = hawk.client.header(url, options.method.toUpperCase(), {
      credentials: {
        id: options.credentials.clientId,
        key: options.credentials.accessToken,
        algorithm: 'sha256'
      },
      ext: options.extra
    });

    options.credentials = 'omit';
    options.headers.Authorization = header.field;
  }

  return new Promise((resolve, reject) => {
    (function attempt(n) {
      fetch(url, options)
        .then(handleResponse)
        .then(resolve)
        .catch((err) => {
          if (n > retries) {
            reject(err);
          } else {
            const delay = Math.min(
              ((n - 1) ** 2) * delayFactor * (((Math.random() * 2 * randomizationFactor) + 1) - randomizationFactor),
              maxDelay
            );

            setTimeout(() => attempt(n + 1), delay);
          }
        });
    }(options.retries));
  });
};
