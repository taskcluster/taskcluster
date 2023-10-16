import got from 'got';
import util from 'util';
import stream from 'stream';
const pipeline = util.promisify(stream.pipeline);
import retry from './retry.js';
import { HashStream, ACCEPTABLE_HASHES } from './hashstream.js';
import taskcluster from './index.js';

// apply default retry config
const makeRetryCfg = ({ retries, delayFactor, randomizationFactor, maxDelay }) => ({
  retries: retries === undefined ? 5 : retries,
  delayFactor: delayFactor === undefined ? 100 : delayFactor,
  randomizationFactor: randomizationFactor === undefined ? randomizationFactor : 0.25,
  maxDelay: maxDelay === undefined ? 30 * 1000 : maxDelay,
});

const s3 = async ({ url, streamFactory, retryCfg }) => {
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

const getUrl = async ({ object, name, resp, streamFactory, retryCfg }) => {
  let responseUsed = false;
  let hashStream;
  let contentType = 'application/binary';

  await retry(retryCfg, async (retriableError, attempt) => {
    // renew the download URL if necessary (note that we assume the object-sevice
    // credentials are good for long enough)
    if (responseUsed && new Date(resp.expires) < new Date()) {
      resp = await object.startDownload(name, { acceptDownloadMethods: { getUrl: true } });
      responseUsed = false;
    }

    try {
      responseUsed = true;
      const src = got.stream(resp.url, { retry: false });
      src.on('response', res => {
        contentType = res.headers['content-type'] || contentType;
      });
      const dest = await streamFactory();
      hashStream = new HashStream();
      await pipeline(src, hashStream, dest);

      return;
    } catch (err) {
      // treat non-500 HTTP responses as fatal errors, and retry everything else
      if (err instanceof got.HTTPError && err.response.statusCode < 500) {
        throw err;
      }
      return retriableError(err);
    }
  });

  // now that the download is complete, check the hashes.  Note that a hash
  // verification failure does not result in a retry.
  const observedHashes = hashStream.hashes();
  verifyHashes(observedHashes, resp.hashes);

  return contentType;
};

// verify that all known hashes match, and that at least one of them is an
// "acceptable" hash algorithm.  Throws an exception on verification failure.
const verifyHashes = (observedHashes, expectedHashes) => {
  let someValidAcceptableHash = false;
  for (let algo of Object.keys(expectedHashes)) {
    const computed = observedHashes[algo];
    if (!computed) {
      // ignore unknown hash algorithms
      continue;
    }
    if (computed !== expectedHashes[algo]) {
      throw new Error(`Computed ${algo} hash does not match that from object service`);
    }

    if (ACCEPTABLE_HASHES.has(algo)) {
      someValidAcceptableHash = true;
    }
  }

  if (!someValidAcceptableHash) {
    throw new Error("No acceptable hash algorithm found");
  }
};

export const download = async ({ name, object, streamFactory, retries, delayFactor,
  randomizationFactor, maxDelay }) => {
  const retryCfg = makeRetryCfg({ retries, delayFactor, randomizationFactor, maxDelay });

  const acceptDownloadMethods = {
    getUrl: true,
  };

  const resp = await object.startDownload(name, { acceptDownloadMethods });

  if (resp.method === 'getUrl') {
    return await getUrl({ object, name, resp, streamFactory, retryCfg });
  } else {
    throw new Error("Could not negotiate a download method");
  }
};

export const downloadArtifact = async ({
  taskId, runId, name, queue, streamFactory, retries, delayFactor, randomizationFactor, maxDelay,
}) => {
  const retryCfg = makeRetryCfg({ retries, delayFactor, randomizationFactor, maxDelay });

  let artifact = await (runId === undefined ? queue.latestArtifact(taskId, name) : queue.artifact(taskId, runId, name));

  switch (artifact.storageType) {
    case "reference":
    case "s3": {
      return await s3({ url: artifact.url, streamFactory, retryCfg });
    }

    case "object": {
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

export default { download, downloadArtifact };
