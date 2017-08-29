import merge from 'deepmerge';
import hawk from 'hawk';

const defaults = {
  credentials: 'omit',
  retries: 5,
  delayFactor: 100,
  randomizationFactor: 0.25,
  maxDelay: 30 * 1000,
  timeout: 30 * 1000,
  headers: {}
};

export default (url, opts = {}) => {
  const options = merge(defaults, opts);
  const { delayFactor, randomizationFactor, maxDelay, retries } = options;

  if (typeof options.credentials !== 'string') {
    const header = hawk.client.header(url, options.method, {
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
        .then(resolve)
        .catch(err => {
          if (n > retries) {
            return reject(err);
          }

          const delay = Math.min(
            Math.pow(2, n - 1) * delayFactor * (Math.random() * 2 * randomizationFactor + 1 - randomizationFactor),
            maxDelay
          );

          setTimeout(() => attempt(n + 1), delay);
        });
    })(options.retries);
  });
};
