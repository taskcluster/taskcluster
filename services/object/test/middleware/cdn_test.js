import assert from 'node:assert';
import helper from '../helper/index.js';
import testing from '@taskcluster/lib-testing';
import request from 'superagent';
import crypto from 'node:crypto';
import taskcluster from '@taskcluster/client';

helper.secrets.mockSuite(testing.suiteName(), [], (mock, skipping) => {
  helper.withDb(mock, skipping);
  helper.resetTables();
  helper.withBackends(skipping);
  helper.withMiddleware(skipping, [
    { middlewareType: 'cdn', regexp: '^public/.*', baseUrl: 'https://cdn.example.com/' },
  ]);
  helper.withServer(skipping);

  const makeObject = async name => {
    const data = crypto.randomBytes(128);
    const uploadId = taskcluster.slugid();
    const proposedUploadMethods = {
      dataInline: {
        contentType: 'application/binary',
        objectData: data.toString('base64'),
      },
    };

    await helper.apiClient.createUpload(name, {
      projectId: 'x',
      expires: taskcluster.fromNow('1 year'),
      uploadId,
      proposedUploadMethods,
    });
    await helper.apiClient.finishUpload(name, { projectId: 'x', uploadId });
  };

  test('intercepts matching simple downloads', async () => {
    await makeObject('public/foo/bar');
    const downloadUrl = helper.apiClient.externalBuildSignedUrl(helper.apiClient.download, 'public/foo/bar');
    const res = await request
      .get(downloadUrl)
      .redirects(0)
      .ok(res => res.status < 400);
    assert.equal(res.statusCode, 303);
    assert.equal(res.headers.location, 'https://cdn.example.com/public/foo/bar');
  });

  test('encodes special characters in redirect', async () => {
    await makeObject('public/a b?x=1#frag');
    const downloadUrl = helper.apiClient.externalBuildSignedUrl(helper.apiClient.download, 'public/a b?x=1#frag');
    const res = await request
      .get(downloadUrl)
      .redirects(0)
      .ok(res => res.status < 400);
    assert.equal(res.statusCode, 303);
    assert.equal(res.headers.location, 'https://cdn.example.com/public/a%20b%3Fx=1%23frag');
  });

  test('does not redirect names with dot segments to the cdn', async () => {
    await makeObject('public/a/../../other');
    const downloadUrl = helper.apiClient.externalBuildSignedUrl(helper.apiClient.download, 'public/a/../../other');
    const res = await request
      .get(downloadUrl)
      .redirects(0)
      .ok(res => res.status < 400);
    assert.equal(res.statusCode, 303);
    assert(!res.headers.location.startsWith('https://cdn'));
  });

  test('ignores non-matching simple downloads', async () => {
    await makeObject('private/foo/bar');
    const downloadUrl = helper.apiClient.externalBuildSignedUrl(helper.apiClient.download, 'private/foo/bar');
    const res = await request
      .get(downloadUrl)
      .redirects(0)
      .ok(res => res.status < 400);
    assert.equal(res.statusCode, 303);
    assert(!res.headers.location.startsWith('https://cdn'));
  });
});
