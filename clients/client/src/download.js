const got = require('got');
const util = require('util');
const pipeline = util.promisify(require('stream').pipeline);
const retry = require('./retry');

const simple = async ({ download, streamFactory, retryCfg }) => {
  const { url } = download;

  return await retry(retryCfg, async (retriableError, attempt) => {
    let contentType = 'application/binary';
    try {
      const src = got.stream(url, { retry: false });
      src.on('response', res => {
        contentType = res.headers['content-type'] || contentType;
      });
      const dest = await streamFactory();
      await pipeline(src, dest);
      return contentType;
    } catch (err) {
      // treat non-500 HTTP responses as fatal errors, and retry everything else
      if (err instanceof got.HTTPError && err.response.statusCode < 500) {
        throw err;
      }
      return retriableError(err);
    }
  });
};

const download = async ({ name, object, streamFactory, retries, delayFactor, randomizationFactor, maxDelay }) => {
  // apply default retry config
  const retryCfg = {
    retries: retries === undefined ? 5 : retries,
    delayFactor: delayFactor === undefined ? 100 : delayFactor,
    randomizationFactor: randomizationFactor === undefined ? randomizationFactor : 0.25,
    maxDelay: maxDelay === undefined ? 30 * 1000 : maxDelay,
  };

  const acceptDownloadMethods = {
    simple: true,
  };

  const download = await object.startDownload(name, { acceptDownloadMethods });

  if (download.method === 'simple') {
    return await simple({ download, streamFactory, retryCfg });
  } else {
    throw new Error("Could not negotiate a download method");
  }
};

module.exports = { download };
