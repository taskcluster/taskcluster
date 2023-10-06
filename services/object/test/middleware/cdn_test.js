import assert from 'assert';
import helper from '../helper';
import testing from 'taskcluster-lib-testing';
import request from 'superagent';
import crypto from 'crypto';
import taskcluster from 'taskcluster-client';

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.resetTables(mock, skipping);
  helper.withBackends(mock, skipping);
  helper.withMiddleware(mock, skipping, [
    { 'middlewareType': 'cdn', regexp: "^public/.*", baseUrl: "https://cdn.example.com/" },
  ]);
  helper.withServer(mock, skipping);

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

  test('intercepts matching simple downloads', async function() {
    await makeObject('public/foo/bar');
    const downloadUrl = helper.apiClient.externalBuildSignedUrl(helper.apiClient.download, 'public/foo/bar');
    const res = await request.get(downloadUrl).redirects(0).ok(res => res.status < 400);
    assert.equal(res.statusCode, 303);
    assert.equal(res.headers.location, "https://cdn.example.com/public/foo/bar");
  });

  test('ignores non-matching simple downloads', async function() {
    await makeObject('private/foo/bar');
    const downloadUrl = helper.apiClient.externalBuildSignedUrl(helper.apiClient.download, 'private/foo/bar');
    const res = await request.get(downloadUrl).redirects(0).ok(res => res.status < 400);
    assert.equal(res.statusCode, 303);
    assert(!res.headers.location.startsWith("https://cdn"));
  });
});
