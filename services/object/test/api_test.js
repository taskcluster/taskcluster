const assert = require('assert');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');
const request = require('superagent');
const crypto = require('crypto');
const { toDataUrl } = require('../src/backends/test');
const { fromNow } = require('taskcluster-client');

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.resetTables(mock, skipping);
  helper.withBackends(mock, skipping);
  helper.withServer(mock, skipping);

  test('ping', async function() {
    await helper.apiClient.ping();
  });

  suite('uploadObject method', function() {
    test('should be able to upload', async function() {
      const data = crypto.randomBytes(128);
      await helper.apiClient.uploadObject('public/foo', {
        projectId: 'x',
        data: data.toString('base64'),
        expires: fromNow('1 year'),
      });
      const rows = await helper.db.fns.get_object('public/foo');

      assert.equal(rows.length, 1);
      assert.equal(rows[0].name, 'public/foo');
      assert.equal(rows[0].project_id, 'x');
      assert.equal(rows[0].backend_id, 'testBackend');
      assert.deepEqual(rows[0].data, {});
    });
    test('should return 409 if object already exists', async function() {
      const data = crypto.randomBytes(128);
      await helper.apiClient.uploadObject('public/foo', {
        projectId: 'x',
        data: data.toString('base64'),
        expires: fromNow('1 year'),
      });
      await assert.rejects(
        () => helper.apiClient.uploadObject('public/foo', {
            projectId: 'x',
            data: data.toString('base64'),
            expires: fromNow('1 year'),
        }),
        err => err.code === 'RequestConflict' && err.statusCode === 409,
      )
    });
  });

  suite('downloadObject method', function() {
    test('downloadObject for a supported method succeeds', async function() {
      const data = crypto.randomBytes(128);
      await helper.apiClient.uploadObject('public/foo', {
        projectId: 'x',
        data: data.toString('base64'),
        expires: fromNow('1 year'),
      });
      const res = await helper.apiClient.downloadObject('public/foo', {
        acceptDownloadMethods: { 'HTTP:GET': true },
      });
      assert.deepEqual(res, {
        method: 'HTTP:GET',
        details: {
          url: 'https://google.ca',
        },
      });
    });

    test('downloadObject for an unsupported method returns 406', async function() {
      const data = crypto.randomBytes(128);
      await helper.apiClient.uploadObject('has/no/methods', {
        projectId: 'x',
        data: data.toString('base64'),
        expires: fromNow('1 year'),
      });
      await assert.rejects(
        () => helper.apiClient.downloadObject('has/no/methods', {
          acceptDownloadMethods: { simple: true, 'HTTP:GET': true },
        }),
        err => err.code === 'NoMatchingMethod' && err.statusCode === 406,
      );
    });
  });

  suite('download method', function() {
    test('simple download redirects to a URL', async function() {
      const data = crypto.randomBytes(128);
      await helper.apiClient.uploadObject('foo/bar', {
        projectId: 'x',
        data: data.toString('base64'),
        expires: fromNow('1 year'),
      });

      const downloadUrl = helper.apiClient.externalBuildSignedUrl(helper.apiClient.download, 'foo/bar');
      const res = await request.get(downloadUrl).redirects(0).ok(res => res.status < 400);
      assert.equal(res.statusCode, 303);
      assert.equal(res.headers.location, toDataUrl(data));
    });

    test('simple download for missing object returns 404', async function() {
      const downloadUrl = helper.apiClient.externalBuildSignedUrl(helper.apiClient.download, 'no/such');
      const res = await request.get(downloadUrl).redirects(0).ok(res => res.status === 404);
      assert.equal(res.statusCode, 404);
    });

    test('simple download for object that does not support the method returns 406', async function() {
      const data = crypto.randomBytes(128);
      await helper.apiClient.uploadObject('has/no/methods', {
        projectId: 'x',
        data: data.toString('base64'),
        expires: fromNow('1 year'),
      });
      const downloadUrl = helper.apiClient.externalBuildSignedUrl(helper.apiClient.download, 'has/no/methods');
      const res = await request.get(downloadUrl).redirects(0).ok(res => res.status === 406);
      assert.equal(res.statusCode, 406);
    });
  });
});
