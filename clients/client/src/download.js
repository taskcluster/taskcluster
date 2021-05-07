const got = require('got');
const util = require('util');
const pipeline = util.promisify(require('stream').pipeline);
const retry = require('./retry');

const simple = async ({ url, streamFactory, retryCfg }) => {
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

// apply default retry config
const makeRetryCfg = ({ retries, delayFactor, randomizationFactor, maxDelay }) => ({
  retries: retries === undefined ? 5 : retries,
  delayFactor: delayFactor === undefined ? 100 : delayFactor,
  randomizationFactor: randomizationFactor === undefined ? randomizationFactor : 0.25,
  maxDelay: maxDelay === undefined ? 30 * 1000 : maxDelay,
});

const download = async ({ name, object, streamFactory, retries, delayFactor, randomizationFactor, maxDelay }) => {
  const retryCfg = makeRetryCfg({ retries, delayFactor, randomizationFactor, maxDelay });

  const acceptDownloadMethods = {
    simple: true,
  };

  const download = await object.startDownload(name, { acceptDownloadMethods });

  if (download.method === 'simple') {
    return await simple({ url: download.url, streamFactory, retryCfg });
  } else {
    throw new Error("Could not negotiate a download method");
  }
};

const downloadArtifact = async ({
  taskId, runId, name, queue, streamFactory, retries, delayFactor, randomizationFactor, maxDelay,
}) => {
  const retryCfg = makeRetryCfg({ retries, delayFactor, randomizationFactor, maxDelay });

  let artifact = await (runId === undefined ? queue.latestArtifact(taskId, name) : queue.artifact(taskId, runId, name));

  switch (artifact.storageType) {
    case "reference":
    case "s3": {
      // downloading these artifact types is identical to a simple download
      return await simple({ url: artifact.url, streamFactory, retryCfg });
    }

    case "object": {
      // `taskcluster.Object` is created at runtime, so we cannot require this
      // at the top level.
      const taskcluster = require('./index');
      const object = new taskcluster.Object({
        rootUrl: queue._options._trueRootUrl,
        credentials: artifact.credentials,
      });
      return await download({ name: artifact.name, object, streamFactory, ...retryCfg });
    }

    case "error": {
      const err = new Error(artifact.message);
      err.reason = artifact.reason;
      throw err;
    }

    default:
      throw new Error(`Unsupported artifact storageType '${artifact.storageType}'`);
  }
};

module.exports = { download, downloadArtifact };
