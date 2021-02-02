const assert = require('assert');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');
const taskcluster = require('taskcluster-client');
const request = require('superagent');
const crypto = require('crypto');
const { toDataUrl, TestBackend } = require('../src/backends/test');
const { fromNow } = require('taskcluster-client');

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.resetTables(mock, skipping);
  helper.withBackends(mock, skipping);
  helper.withMiddleware(mock, skipping);
  helper.withServer(mock, skipping);

  test('ping', async function() {
    await helper.apiClient.ping();
  });

  suite('uploadObject method', function() {
    test('should be able to upload', async function() {
      const data = crypto.randomBytes(128);
      const uploadId = taskcluster.slugid();
      await helper.apiClient.uploadObject('public/foo', {
        projectId: 'x',
        data: data.toString('base64'),
        uploadId,
        expires: fromNow('1 year'),
      });
      const rows = await helper.db.fns.get_object_with_upload('public/foo');

      assert.equal(rows.length, 1);
      assert.equal(rows[0].name, 'public/foo');
      assert.equal(rows[0].project_id, 'x');
      assert.equal(rows[0].upload_id, null); // upload has been finished
      assert.equal(rows[0].backend_id, 'testBackend');
      assert.deepEqual(rows[0].data, {});
    });

    test('should return 409 if object already exists', async function() {
      const data = crypto.randomBytes(128);
      const uploadId = taskcluster.slugid();
      await helper.apiClient.uploadObject('public/foo', {
        projectId: 'x',
        data: data.toString('base64'),
        uploadId,
        expires: fromNow('1 year'),
      });
      // note that the upload is completed during the call to uploadObject, so
      // idempotency doesn't apply
      await assert.rejects(
        () => helper.apiClient.uploadObject('public/foo', {
          projectId: 'x',
          data: data.toString('base64'),
          uploadId,
          expires: fromNow('1 year'),
        }),
        err => err.code === 'RequestConflict' && err.statusCode === 409,
      );
    });

    test('idempotent if the upload fails', async function() {
      const data = crypto.randomBytes(128);
      const uploadId = taskcluster.slugid();
      const expires = taskcluster.fromNow('1 day');

      // patch the test backend to fail on upload
      try {
        TestBackend.failUpload = true;
        await assert.rejects(
          () => helper.apiClient.use({ retries: 0 }).uploadObject('public/foo', {
            projectId: 'x',
            data: data.toString('base64'),
            uploadId,
            expires,
          }),
          err => err.statusCode === 500,
        );

        TestBackend.failUpload = false;

        // should fail with an incorrect uploadId
        await assert.rejects(
          () => helper.apiClient.use({ retries: 0 }).uploadObject('public/foo', {
            projectId: 'x',
            data: data.toString('base64'),
            uploadId: taskcluster.slugid(),
            expires,
          }),
          err => err.statusCode === 409,
        );

        // should succeed this time..
        await helper.apiClient.uploadObject('public/foo', {
          projectId: 'x',
          data: data.toString('base64'),
          uploadId,
          expires,
        });

      } finally {
        delete TestBackend.failUpload;
      }

      // check that the error was logged
      const monitor = await helper.load('monitor');
      assert.equal(
        monitor.manager.messages.filter(
          ({ Type, Fields }) => Type === 'monitor.error' && Fields.message === 'uhoh',
        ).length,
        1);
      monitor.manager.reset();
    });
  });

  suite('startDownload method', function() {
    test('startDownload for simple method succeeds', async function() {
      const data = crypto.randomBytes(128);
      await helper.apiClient.uploadObject('public/foo', {
        projectId: 'x',
        data: data.toString('base64'),
        uploadId: taskcluster.slugid(),
        expires: fromNow('1 year'),
      });
      const res = await helper.apiClient.startDownload('public/foo', {
        acceptDownloadMethods: { 'simple': true },
      });
      assert.deepEqual(res, {
        method: 'simple',
        url: toDataUrl(data),
      });
    });

    test('startDownload for a supported method succeeds', async function() {
      const data = crypto.randomBytes(128);
      await helper.apiClient.uploadObject('public/foo', {
        projectId: 'x',
        data: data.toString('base64'),
        uploadId: taskcluster.slugid(),
        expires: fromNow('1 year'),
      });
      const res = await helper.apiClient.startDownload('public/foo', {
        acceptDownloadMethods: { 'HTTP:GET': true },
      });
      assert.deepEqual(res, {
        method: 'HTTP:GET',
        details: {
          url: 'https://google.ca',
        },
      });
    });

    test('startDownload handles middleware', async function() {
      const data = crypto.randomBytes(128);
      await helper.apiClient.uploadObject('dl/intercept', {
        projectId: 'x',
        data: data.toString('base64'),
        uploadId: taskcluster.slugid(),
        expires: fromNow('1 year'),
      });

      const res = await helper.apiClient.startDownload('dl/intercept', {
        acceptDownloadMethods: { 'simple': true },
      });

      assert.deepEqual(res, {
        method: 'simple',
        url: 'http://intercepted',
      });
    });

    test('startDownload for an unsupported method returns 406', async function() {
      const data = crypto.randomBytes(128);
      await helper.apiClient.uploadObject('has/no/methods', {
        projectId: 'x',
        data: data.toString('base64'),
        uploadId: taskcluster.slugid(),
        expires: fromNow('1 year'),
      });
      await assert.rejects(
        () => helper.apiClient.startDownload('has/no/methods', {
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
        uploadId: taskcluster.slugid(),
        expires: fromNow('1 year'),
      });

      const downloadUrl = helper.apiClient.externalBuildSignedUrl(helper.apiClient.download, 'foo/bar');
      const res = await request.get(downloadUrl).redirects(0).ok(res => res.status < 400);
      assert.equal(res.statusCode, 303);
      assert.equal(res.headers.location, toDataUrl(data));
    });

    test('simple download handles middleware', async function() {
      const data = crypto.randomBytes(128);
      await helper.apiClient.uploadObject('simple/intercept', {
        projectId: 'x',
        data: data.toString('base64'),
        uploadId: taskcluster.slugid(),
        expires: fromNow('1 year'),
      });

      const downloadUrl = helper.apiClient.externalBuildSignedUrl(helper.apiClient.download, 'simple/intercept');
      const res = await request.get(downloadUrl).redirects(0).ok(res => res.status < 400);
      assert.equal(res.statusCode, 303);
      assert.equal(res.headers.location, 'http://intercepted');
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
        uploadId: taskcluster.slugid(),
        expires: fromNow('1 year'),
      });
      const downloadUrl = helper.apiClient.externalBuildSignedUrl(helper.apiClient.download, 'has/no/methods');
      const res = await request.get(downloadUrl).redirects(0).ok(res => res.status === 406);
      assert.equal(res.statusCode, 406);
    });
  });
});
