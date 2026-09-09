import http from 'node:http';
import { PassThrough } from 'node:stream';
import { strict as assert } from 'node:assert';
import { downloadArtifact, downloadManagedArtifact } from '../src/index.js';
import testing from './helper.js';

/**
 * Artifact download behavior that does not require credentials, exercised against a local HTTP
 * server and a fake queue.
 */
suite(testing.suiteName(), () => {
  let server, base;

  suiteSetup(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/gone') {
        res.writeHead(404);
        return res.end('no such object');
      }
      if (req.url === '/broken') {
        res.writeHead(500);
        return res.end('server error');
      }
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('hello, world');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  suiteTeardown(() => server.close());

  // a queue resolving any artifact to the given record
  const resolvingTo = artifact => ({
    latestArtifact: async () => artifact,
    artifact: async () => artifact,
  });

  const sink = () => {
    const stream = new PassThrough();
    stream.resume();
    return stream;
  };

  const tryDownload = async (downloader, queue) =>
    await downloader({ taskId: 'taskid', name: 'public/test.file', queue, streamFactory: sink, retries: 0 });

  test('a stored artifact whose content is missing reports 404', async () => {
    await assert.rejects(
      () => tryDownload(downloadManagedArtifact, resolvingTo({ storageType: 's3', url: `${base}/gone` })),
      err => err.statusCode === 404
    );
  });

  test('a missing artifact record reports 404', async () => {
    const queue = {
      latestArtifact: async () => {
        throw Object.assign(new Error('no such artifact'), { statusCode: 404 });
      },
    };

    await assert.rejects(
      () => tryDownload(downloadManagedArtifact, queue),
      err => err.statusCode === 404
    );
  });

  test('a server error reports its status once retries are exhausted', async () => {
    await assert.rejects(
      () => tryDownload(downloadArtifact, resolvingTo({ storageType: 's3', url: `${base}/broken` })),
      err => err.statusCode === 500
    );
  });

  test('downloadManagedArtifact refuses a reference artifact', async () => {
    await assert.rejects(
      () => tryDownload(downloadManagedArtifact, resolvingTo({ storageType: 'reference', url: base })),
      err => err.code === 'ArtifactStorageTypeRejected' && err.storageType === 'reference'
    );
  });

  test('downloadArtifact still follows a reference artifact', async () => {
    const contentType = await tryDownload(
      downloadArtifact,
      resolvingTo({ storageType: 'reference', url: `${base}/ok` })
    );

    assert.equal(contentType, 'text/plain');
  });

  test('an error artifact reports ArtifactError', async () => {
    await assert.rejects(
      () => tryDownload(downloadArtifact, resolvingTo({ storageType: 'error', message: 'oh noes', reason: 'test' })),
      err => err.code === 'ArtifactError' && err.reason === 'test'
    );
  });
});
