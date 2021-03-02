const assert = require('assert').strict;
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

  const createTestObject = async name => {
    const data = crypto.randomBytes(128);
    const proposedUploadMethods = {
      dataInline: {
        contentType: 'application/binary',
        objectData: data.toString('base64'),
      },
    };
    const uploadId = taskcluster.slugid();
    await helper.apiClient.createUpload(name, {
      projectId: 'x',
      uploadId,
      expires: fromNow('1 year'),
      proposedUploadMethods,
    });
    await helper.apiClient.finishUpload(name, { projectId: 'x', uploadId });

    return data;
  };

  test('ping', async function() {
    await helper.apiClient.ping();
  });

  suite('createUpload method', function() {
    test('should be able to upload with a dataInline method', async function() {
      const data = crypto.randomBytes(128);
      const uploadId = taskcluster.slugid();
      await helper.apiClient.createUpload('public/foo', {
        projectId: 'x',
        uploadId,
        expires: fromNow('1 year'),
        proposedUploadMethods: {
          dataInline: {
            contentType: 'application/binary',
            objectData: data.toString('base64'),
          },
        },
      });
      const rows = await helper.db.fns.get_object_with_upload('public/foo');

      assert.equal(rows.length, 1);
      assert.equal(rows[0].name, 'public/foo');
      assert.equal(rows[0].project_id, 'x');
      assert.equal(rows[0].upload_id, uploadId); // upload has not been finished
      assert.equal(rows[0].backend_id, 'testBackend');
      assert.deepEqual(rows[0].data, {});
    });

    test('should return 409 if object is already uploaded', async function() {
      const data = crypto.randomBytes(128);
      const uploadId = taskcluster.slugid();
      const expires = taskcluster.fromNow('1 day');
      const proposedUploadMethods = {
        dataInline: {
          contentType: 'application/binary',
          objectData: data.toString('base64'),
        },
      };

      await helper.apiClient.createUpload('public/foo', {
        projectId: 'x',
        uploadId,
        expires,
        proposedUploadMethods,
      });

      await helper.apiClient.finishUpload('public/foo', { projectId: 'x', uploadId });

      // note that the upload is completed during the call to createUpload, so
      // idempotency doesn't apply
      await assert.rejects(
        () => helper.apiClient.createUpload('public/foo', {
          projectId: 'x',
          uploadId,
          expires,
          proposedUploadMethods,
        }),
        err => err.code === 'RequestConflict' && err.statusCode === 409,
      );
    });

    test('should return 409 if upload is started with different expires or uploadId', async function() {
      const uploadId = taskcluster.slugid();
      const expires = taskcluster.fromNow('1 day');
      const proposedUploadMethods = {}; // propose nothing

      await helper.apiClient.createUpload('public/foo', {
        projectId: 'x',
        uploadId,
        expires,
        proposedUploadMethods,
      });

      await assert.rejects(
        () => helper.apiClient.createUpload('public/foo', {
          projectId: 'x',
          uploadId: taskcluster.slugid(),
          expires,
          proposedUploadMethods,
        }),
        err => err.code === 'RequestConflict' && err.statusCode === 409,
      );
      await assert.rejects(
        () => helper.apiClient.createUpload('public/foo', {
          projectId: 'x',
          uploadId,
          expires: taskcluster.fromNow('2 days'),
          proposedUploadMethods,
        }),
        err => err.code === 'RequestConflict' && err.statusCode === 409,
      );
    });

    test('should succeed on second attempt to create an upload', async function() {
      const data = crypto.randomBytes(128);
      const uploadId = taskcluster.slugid();
      const expires = taskcluster.fromNow('1 day');
      const proposedUploadMethods = {
        dataInline: {
          contentType: 'application/binary',
          objectData: data.toString('base64'),
        },
      };

      let res = await helper.apiClient.createUpload('public/foo', {
        projectId: 'x',
        uploadId,
        expires,
        proposedUploadMethods: {}, // propose nothing the first time
      });
      assert.equal(res.projectId, 'x');
      assert.equal(res.uploadId, uploadId);
      assert.equal(res.expires, expires.toJSON());
      assert.deepEqual(res.uploadMethod, {}); // no method matched

      res = await helper.apiClient.createUpload('public/foo', {
        projectId: 'x',
        uploadId,
        expires,
        proposedUploadMethods, // propose an actual upload this time
      });
      assert.equal(res.projectId, 'x');
      assert.equal(res.uploadId, uploadId);
      assert.equal(res.expires, expires.toJSON());
      assert.deepEqual(res.uploadMethod, { dataInline: true });
    });

    test('should allow a putUrl method', async function() {
      const uploadId = taskcluster.slugid();
      const expires = taskcluster.fromNow('1 day');
      const proposedUploadMethods = {
        putUrl: {
          contentType: 'application/binary',
          contentLength: 7,
        },
      };

      let res = await helper.apiClient.createUpload('public/foo', {
        projectId: 'x',
        uploadId,
        expires,
        proposedUploadMethods,
      });
      assert.equal(res.projectId, 'x');
      assert.equal(res.uploadId, uploadId);
      assert.equal(res.expires, expires.toJSON());
      // no method matched, as the test provider does not support putUrl
      assert.deepEqual(res.uploadMethod, {});
    });

    test('should succeed on a subsequent attempt if the upload fails', async function() {
      const data = crypto.randomBytes(128);
      const uploadId = taskcluster.slugid();
      const expires = taskcluster.fromNow('1 day');
      const proposedUploadMethods = {
        dataInline: {
          contentType: 'application/binary',
          objectData: data.toString('base64'),
        },
      };

      try {
        // patch the test backend to fail on upload
        TestBackend.failUpload = true;

        await assert.rejects(
          () => helper.apiClient.use({ retries: 0 }).createUpload('public/foo', {
            projectId: 'x',
            uploadId,
            expires,
            proposedUploadMethods,
          }),
          err => err.statusCode === 500,
        );

        // switch back to succeeding
        TestBackend.failUpload = false;

        // should fail with an incorrect uploadId
        await assert.rejects(
          () => helper.apiClient.use({ retries: 0 }).createUpload('public/foo', {
            projectId: 'x',
            uploadId: taskcluster.slugid(),
            expires,
            proposedUploadMethods,
          }),
          err => err.statusCode === 409,
        );

        // should fail with an incorrect expires
        await assert.rejects(
          () => helper.apiClient.use({ retries: 0 }).createUpload('public/foo', {
            projectId: 'x',
            uploadId,
            expires: taskcluster.fromNow('2 days'),
            proposedUploadMethods,
          }),
          err => err.statusCode === 409,
        );

        // should succeed this time..
        await helper.apiClient.createUpload('public/foo', {
          projectId: 'x',
          uploadId,
          expires,
          proposedUploadMethods,
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

  suite('finishUpload method', function() {
    const projectId = 'proj';
    const makeUpload = async name => {
      const data = crypto.randomBytes(128);
      const uploadId = taskcluster.slugid();
      await helper.apiClient.createUpload(name, {
        projectId,
        uploadId,
        expires: fromNow('1 year'),
        proposedUploadMethods: {
          dataInline: {
            contentType: 'application/binary',
            objectData: data.toString('base64'),
          },
        },
      });
      return uploadId;
    };

    test('fails for a nonexistent object', async function() {
      const uploadId = taskcluster.slugid();
      await assert.rejects(
        () => helper.apiClient.finishUpload('no/such', { uploadId, projectId }),
        err => err.statusCode === 404);
    });

    test('fails with incorrect uploadId', async function() {
      await makeUpload('foo/bar');
      await assert.rejects(
        () => helper.apiClient.finishUpload('foo/bar', { uploadId: taskcluster.slugid(), projectId }),
        err => err.statusCode === 409);
    });

    test('fails with incorrect projectId', async function() {
      const uploadId = await makeUpload('foo/bar');
      await assert.rejects(
        () => helper.apiClient.finishUpload('foo/bar', { uploadId, projectId: 'different' }),
        err => err.statusCode === 400);
    });

    test('completes an upload', async function() {
      const uploadId = await makeUpload('foo/bar');

      // can't download this object yet..
      assert.rejects(
        () => helper.apiClient.startDownload('foo/bar', { acceptDownloadMethods: { simple: true } }),
        err => err.stautsCode === 404);

      await helper.apiClient.finishUpload('foo/bar', { uploadId, projectId });

      // now it can be downloaded
      helper.apiClient.startDownload('foo/bar', { acceptDownloadMethods: { simple: true } });
    });

    test('succeeds for an already-completed upload', async function() {
      const uploadId = await makeUpload('foo/bar');
      await helper.apiClient.finishUpload('foo/bar', { uploadId, projectId });
      await helper.apiClient.finishUpload('foo/bar', { uploadId, projectId });
    });
  });

  suite('startDownload method', function() {
    test('startDownload for simple method succeeds', async function() {
      const data = await createTestObject('public/foo');
      const res = await helper.apiClient.startDownload('public/foo', {
        acceptDownloadMethods: { 'simple': true },
      });
      assert.deepEqual(res, {
        method: 'simple',
        url: toDataUrl(data),
      });
    });

    test('startDownload for a supported method succeeds', async function() {
      await createTestObject('public/foo');
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
      await createTestObject('dl/intercept');

      const res = await helper.apiClient.startDownload('dl/intercept', {
        acceptDownloadMethods: { 'simple': true },
      });

      assert.deepEqual(res, {
        method: 'simple',
        url: 'http://intercepted',
      });
    });

    test('startDownload for an unsupported method returns 406', async function() {
      await createTestObject('has/no/methods');
      await assert.rejects(
        () => helper.apiClient.startDownload('has/no/methods', {
          acceptDownloadMethods: { simple: true, 'HTTP:GET': true },
        }),
        err => err.code === 'NoMatchingMethod' && err.statusCode === 406,
      );
    });
  });

  suite('simple download method', function() {
    test('simple download redirects to a URL', async function() {
      const data = await createTestObject('foo/bar');
      const downloadUrl = helper.apiClient.externalBuildSignedUrl(helper.apiClient.download, 'foo/bar');
      const res = await request.get(downloadUrl).redirects(0).ok(res => res.status < 400);
      assert.equal(res.statusCode, 303);
      assert.equal(res.headers.location, toDataUrl(data));
    });

    test('simple download handles middleware', async function() {
      await createTestObject('simple/intercept');
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
      await createTestObject('has/no/methods');
      const downloadUrl = helper.apiClient.externalBuildSignedUrl(helper.apiClient.download, 'has/no/methods');
      const res = await request.get(downloadUrl).redirects(0).ok(res => res.status === 406);
      assert.equal(res.statusCode, 406);
    });
  });
});
