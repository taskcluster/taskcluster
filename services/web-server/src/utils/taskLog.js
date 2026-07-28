import { downloadManagedArtifact } from '@taskcluster/client';
import { Transform } from 'node:stream';
import { lineIterator } from '../profiler/log-profile.js';

export const LOG_ARTIFACT_NAMES = ['public/logs/live.log', 'public/logs/live_backing.log'];

const MAX_LOG_SIZE = 200 * 1024 * 1024; // 200MB

class LogTooLargeError extends Error {
  constructor(maxBytes) {
    super(`Log exceeds ${Math.round(maxBytes / (1024 * 1024))}MB size limit`);
    this.code = 'LogTooLarge';
  }
}

/**
 * Open a task log for reading: live.log or live_backing.log, whichever exists and is not a reference artifact
 *
 * Returns `{ name, stream, downloaded }`, or null if no name yielded content, where `downloaded`
 * resolves to the download's error or to null if it completed.  The caller must read `stream` to
 * the end or destroy it, or the download blocks forever on backpressure.
 */
export const openTaskLog = async ({ queue, taskId }) => {
  for (const name of LOG_ARTIFACT_NAMES) {
    const { promise: receivingContent, resolve: onContent } = /** @type {PromiseWithResolvers<void>} */ (
      Promise.withResolvers()
    );

    // The download opens its destination before the HTTP response arrives, so being handed the
    // stream says nothing about whether there is content behind it, wait for the stream itself to
    // carry a chunk.
    const stream = new Transform({
      transform(chunk, _encoding, callback) {
        onContent();
        callback(null, chunk);
      },
    });
    // failures are reported through `downloaded`
    stream.on('error', () => {});

    const downloaded = downloadManagedArtifact({
      taskId,
      name,
      queue,
      // the destination is a single stream shared with the caller, so it cannot be retried
      retries: 0,
      streamFactory: async () => stream,
    }).then(
      () => null,
      err => err
    );

    // A rejection arriving before any content means this name yielded nothing to read
    // Empty artifact or response is not a failure: `downloaded` resolves to null and wins the race.
    const failedBeforeContent = await Promise.race([receivingContent.then(() => null), downloaded]);
    if (failedBeforeContent) {
      continue;
    }

    return { name, stream, downloaded };
  }

  return null;
};

/**
 * Iterate the lines of a log opened by openTaskLog, throwing an error with `code` of `'LogTooLarge'` past `maxBytes`.
 */
export const readTaskLogLines = async function* (log, { maxBytes = MAX_LOG_SIZE } = {}) {
  let bytesRead = 0;

  // counted per chunk rather than per line: a log containing no newline never yields a line, so a
  // per-line check would not run until lineIterator had buffered the entire artifact
  const countBytes = n => {
    bytesRead += n;
    if (bytesRead > maxBytes) {
      throw new LogTooLargeError(maxBytes);
    }
  };

  try {
    for await (const line of lineIterator(log.stream, countBytes)) {
      yield line;
    }
  } finally {
    log.stream.destroy();
  }

  const downloadError = await log.downloaded;
  if (downloadError) {
    throw downloadError;
  }
};
