import got, { HTTPError } from 'got';
import { slugid } from './utils.js';
import retry from './retry.js';
import { HashStream } from './hashstream.js';

const DATA_INLINE_MAX_SIZE = 8192;

const putUrl = async ({ streamFactory, contentLength, uploadMethod, retryCfg }) => {
  const { url, headers } = uploadMethod.putUrl;
  await retry(retryCfg, async (retriableError, attempt) => {
    try {
      await got.put(url, {
        headers,
        retry: { limit: 0 }, // use our own retry logic
        body: await streamFactory(),
      });
    } catch (err) {
      // treat non-500 HTTP responses as fatal errors, and retry everything else
      if (err instanceof HTTPError && err.response.statusCode < 500) {
        throw err;
      }
      return retriableError(err);
    }
  });
};

const readFullStream = stream => {
  const chunks = [];
  return new Promise((accept, reject) => {
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('error', err => reject(err));
    stream.on('end', () => accept(Buffer.concat(chunks)));
  });
};

export const upload = async ({
  projectId,
  name,
  contentType,
  contentLength,
  expires,
  object,
  streamFactory,
  retries,
  delayFactor,
  randomizationFactor,
  maxDelay,
  uploadId,
}) => {
  if (!uploadId) {
    uploadId = slugid();
  }

  // set up to hash streams as we read them
  let hashStream;
  const hashStreamFactory = async () => {
    hashStream = new HashStream();
    return (await streamFactory()).pipe(hashStream);
  };

  // apply default retry config
  const retryCfg = {
    retries: retries === undefined ? 5 : retries,
    delayFactor: delayFactor === undefined ? 100 : delayFactor,
    randomizationFactor: randomizationFactor === undefined ? 0.25 : randomizationFactor,
    maxDelay: maxDelay === undefined ? 30 * 1000 : maxDelay,
  };

  const proposedUploadMethods = {};

  if (contentLength < DATA_INLINE_MAX_SIZE) {
    // get the (small) data as a buffer to include in the request
    const data = await readFullStream(await hashStreamFactory());

    proposedUploadMethods.dataInline = {
      contentType,
      objectData: data.toString('base64'),
    };
  }

  proposedUploadMethods.putUrl = {
    contentType,
    contentLength,
  };

  const res = await object.createUpload(name, { expires, projectId, uploadId, proposedUploadMethods });

  if (res.uploadMethod.dataInline) {
    // nothing to do
  } else if (res.uploadMethod.putUrl) {
    await putUrl({ streamFactory: hashStreamFactory, contentLength, uploadMethod: res.uploadMethod, retryCfg });
  } else {
    throw new Error("Could not negotiate an upload method");
  }

  const hashes = hashStream.hashes(contentLength);

  await object.finishUpload(name, { projectId, uploadId, hashes });
};

export default upload;
