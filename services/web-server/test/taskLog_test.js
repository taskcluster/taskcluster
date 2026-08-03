import assert from 'node:assert';
import http from 'node:http';
import { Readable } from 'node:stream';
import testing from '@taskcluster/lib-testing';
import { openTaskLog, readTaskLogLines, LOG_ARTIFACT_NAMES } from '../src/utils/taskLog.js';

const [LIVE_LOG, LIVE_BACKING_LOG] = LOG_ARTIFACT_NAMES;
const REFERENCE_ARTIFACT = { storageType: 'reference', url: 'http://169.254.169.254/metadata' };

suite(testing.suiteName(), () => {
  const body = 'first line\nsecond line\n';
  let server, url, missingUrl, emptyUrl;

  suiteSetup(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/missing') {
        // the artifact record exists, but its stored content is gone
        res.writeHead(404);
        return res.end('no such object');
      }
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(req.url === '/empty' ? '' : body);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

    const origin = `http://127.0.0.1:${server.address().port}`;
    url = `${origin}/log`;
    missingUrl = `${origin}/missing`;
    emptyUrl = `${origin}/empty`;
  });

  suiteTeardown(() => server.close());

  // a queue resolving each artifact name to the given record, and any other name to a 404
  const openLog = async resolutions =>
    await openTaskLog({
      taskId: 'taskid',
      queue: {
        latestArtifact: async (_taskId, name) => {
          if (!resolutions[name]) {
            throw Object.assign(new Error('no such artifact'), { statusCode: 404 });
          }
          return resolutions[name];
        },
      },
    });

  const readLines = async (log, options) => {
    const lines = [];
    for await (const line of readTaskLogLines(log, options)) {
      lines.push(line);
    }
    return lines;
  };

  test('reads a stored log', async () => {
    const log = await openLog({ [LIVE_LOG]: { storageType: 's3', url } });

    assert.equal(log.name, LIVE_LOG);
    assert.deepEqual(await readLines(log), ['first line', 'second line']);
  });

  test('falls through to live_backing.log unless there is content to read', async () => {
    const backing = { [LIVE_BACKING_LOG]: { storageType: 's3', url } };

    // first is no no, second ok
    const reference = await openLog({ [LIVE_LOG]: REFERENCE_ARTIFACT, ...backing });
    assert.equal(reference.name, LIVE_BACKING_LOG);

    // live.log content is gone, so falling back to backing
    const contentGone = await openLog({ [LIVE_LOG]: { storageType: 's3', url: missingUrl }, ...backing });
    assert.equal(contentGone.name, LIVE_BACKING_LOG);

    // but some logs might be empty
    const empty = await openLog({ [LIVE_LOG]: { storageType: 's3', url: emptyUrl }, ...backing });
    assert.equal(empty.name, LIVE_LOG);
    assert.deepEqual(await readLines(empty), []);
  });

  test('returns null when no log can be read', async () => {
    assert.equal(await openLog({}), null);
    assert.equal(await openLog({ [LIVE_LOG]: REFERENCE_ARTIFACT, [LIVE_BACKING_LOG]: REFERENCE_ARTIFACT }), null);
  });

  test('stops reading at the byte cap, even with no newline in the log', async () => {
    const chunkSize = 64 * 1024;
    const maxBytes = 4 * chunkSize;
    const availableChunks = 80;

    let chunksRead = 0;
    const stream = new Readable({
      highWaterMark: chunkSize,
      read() {
        if (chunksRead >= availableChunks) {
          return this.push(null);
        }
        chunksRead++;
        this.push(Buffer.alloc(chunkSize, 'x'));
      },
    });
    const log = { name: LIVE_LOG, stream, downloaded: Promise.resolve(null) };

    await assert.rejects(
      () => readLines(log, { maxBytes }),
      err => err.code === 'LogTooLarge'
    );

    assert(
      chunksRead * chunkSize <= maxBytes + 2 * chunkSize,
      `expected reading to stop near the ${maxBytes} byte cap, but ${chunksRead * chunkSize} bytes were pulled`
    );
    // the download must be released rather than left blocked on a stream nobody is reading
    await log.downloaded;
  });
});
