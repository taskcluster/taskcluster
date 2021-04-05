const got = require('got');
const { slugid } = require('./utils');
const retry = require('./retry');
const { Transform } = require('stream');
const { createHash } = require('crypto');

const DATA_INLINE_MAX_SIZE = 8192;

const putUrl = async ({ streamFactory, contentLength, uploadMethod, retryCfg }) => {
  const { url, headers } = uploadMethod.putUrl;
  await retry(retryCfg, async (retriableError, attempt) => {
    try {
      await got.put(url, {
        headers,
        retry: false, // use our own retry logic
        body: await streamFactory(),
      });
    } catch (err) {
      // treat non-500 HTTP responses as fatal errors, and retry everything else
      if (err instanceof got.HTTPError && err.response.statusCode < 500) {
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

/**
 * A stream that hashes the bytes passing through it
 */
class HashStream extends Transform {
  constructor() {
    super();
    this.sha256 = createHash('sha256');
    this.sha512 = createHash('sha512');
    this.bytes = 0;
  }

  _transform(chunk, enc, cb) {
    this.sha256.update(chunk);
    this.sha512.update(chunk);
    this.bytes += chunk.length;
    cb(null, chunk);
  }

  // Return the calculated hashes in a format suitable for finishUpload,
  // checking that the content length matches the bytes hashed.
  hashes(contentLength) {
    if (contentLength !== this.bytes) {
      throw new Error(`Hashed ${this.bytes} bytes but content length is ${contentLength}`);
    }
    return {
      sha256: this.sha256.digest('hex'),
      sha512: this.sha512.digest('hex'),
    };
  }
}

const upload = async ({
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
}) => {
  const uploadId = slugid();

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
    randomizationFactor: randomizationFactor === undefined ? randomizationFactor : 0.25,
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

  // TODO: pass this value to finishUpload when the deployed instance supports it
  // https://github.com/taskcluster/taskcluster/issues/4714
  const _ = hashStream.hashes(contentLength);

  await object.finishUpload(name, { projectId, uploadId });
};

module.exports = { upload };
