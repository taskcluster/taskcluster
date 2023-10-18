import { strict as assert } from 'assert';
import helper from './helper/index.js';
import testing from 'taskcluster-lib-testing';
import taskcluster from 'taskcluster-client';
import request from 'superagent';
import crypto from 'crypto';
import { toDataUrl, TestBackend } from '../src/backends/test.js';

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.resetTables(mock, skipping);
  helper.withBackends(mock, skipping);
  helper.withMiddleware(mock, skipping);
  helper.withServer(mock, skipping);

  // these don't have to be hashes of anything, just have the right format
  const sha256 = 'e38808a4dbfdd9c82a351cc9a6055dffc7b4cc8e12020b2685f8eef92f5d1544';
  const sha512 = sha256 + sha256;

  const createTestObject = async (name, { hashes } = {}) => {
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
      hashes,
      expires: taskcluster.fromNow('1 year'),
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
        expires: taskcluster.fromNow('1 year'),
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

    test('should fail if backend is not found', async function() {
      const data = crypto.randomBytes(128);
      const uploadId = taskcluster.slugid();

      await helper.setBackendConfig({ backends: {}, backendMap: [] });
      await assert.rejects(
        () => helper.apiClient.createUpload('public/foo', {
          projectId: 'x',
          uploadId,
          expires: taskcluster.fromNow('1 year'),
          proposedUploadMethods: {
            dataInline: {
              contentType: 'application/binary',
              objectData: data.toString('base64'),
            },
          },
        }),
        err => err.statusCode === 400);
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

    test('should allow adding new hashes', async function() {
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
        hashes: { sha256 },
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
        hashes: { sha256, sha512 },
        proposedUploadMethods, // propose an actual upload this time
      });
      assert.equal(res.projectId, 'x');
      assert.equal(res.uploadId, uploadId);
      assert.equal(res.expires, expires.toJSON());
      assert.deepEqual(res.uploadMethod, { dataInline: true });

      await helper.apiClient.finishUpload('public/foo', { uploadId, projectId: 'x' });

      const objRes = await helper.apiClient.object('public/foo');
      assert.deepEqual(objRes.hashes, { sha256, sha512 });
    });

    test('should disallow changing hashes', async function() {
      const sha256a = 'e38808a4dbfdd9c82a351cc9a6055dffc7b4cc8e12020b2685f8eef92f5d1544';
      const sha256b = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
      const uploadId = taskcluster.slugid();
      const expires = taskcluster.fromNow('1 day');

      await helper.apiClient.createUpload('public/foo', {
        projectId: 'x',
        uploadId,
        expires,
        hashes: { sha256: sha256a },
        proposedUploadMethods: {},
      });

      await assert.rejects(
        () => helper.apiClient.createUpload('public/foo', {
          projectId: 'x',
          uploadId,
          expires,
          hashes: { sha256: sha256b }, // different sha256 hash
          proposedUploadMethods: {},
        }),
        err => err.statusCode === 409);
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
        expires: taskcluster.fromNow('1 year'),
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

    test('completes an upload, including hashes', async function() {
      const uploadId = await makeUpload('foo/bar');

      // can't download this object yet..
      assert.rejects(
        () => helper.apiClient.startDownload('foo/bar', { acceptDownloadMethods: { simple: true } }),
        err => err.stautsCode === 404);

      await helper.apiClient.finishUpload('foo/bar', { uploadId, projectId, hashes: { sha256 } });

      // now it can be downloaded
      helper.apiClient.startDownload('foo/bar', { acceptDownloadMethods: { simple: true } });

      const res = await helper.apiClient.object('foo/bar');
      assert.deepEqual(res.hashes, { sha256 });
    });

    test('succeeds for an already-completed upload', async function() {
      const uploadId = await makeUpload('foo/bar');
      await helper.apiClient.finishUpload('foo/bar', { uploadId, projectId });
      await helper.apiClient.finishUpload('foo/bar', { uploadId, projectId });
    });

    test('fails for an already-completed upload with different projectId', async function() {
      const uploadId = await makeUpload('foo/bar');
      await helper.apiClient.finishUpload('foo/bar', { uploadId, projectId });
      await assert.rejects(
        () => helper.apiClient.finishUpload('foo/bar', { uploadId, projectId: 'nosuch' }),
        err => err.statusCode === 400);
    });

    test('succeeds for an already-completed upload with hashes', async function() {
      const uploadId = await makeUpload('foo/bar');
      await helper.apiClient.finishUpload('foo/bar', { uploadId, projectId, hashes: { sha256, sha512 } });
      await helper.apiClient.finishUpload('foo/bar', { uploadId, projectId, hashes: { sha256 } });
    });

    test('fails for an already-completed upload with new hashes', async function() {
      const uploadId = await makeUpload('foo/bar');
      await helper.apiClient.finishUpload('foo/bar', { uploadId, projectId, hashes: { sha256 } });
      await assert.rejects(
        () => helper.apiClient.finishUpload('foo/bar', { uploadId, projectId, hashes: { sha256, sha512 } }),
        err => err.statusCode === 409);
    });

    test('fails for an already-completed upload with changed hashes', async function() {
      const uploadId = await makeUpload('foo/bar');
      await helper.apiClient.finishUpload('foo/bar', { uploadId, projectId, hashes: { sha256 } });
      const badSha256 = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
      await assert.rejects(
        () => helper.apiClient.finishUpload('foo/bar', { uploadId, projectId, hashes: { sha256: badSha256 } }),
        err => err.statusCode === 409);
    });

    test('completes an upload, even if there are no hashes for the object', async function() {
      const uploadId = await makeUpload('foo/bar');
      await helper.apiClient.finishUpload('foo/bar', { uploadId, projectId });
      const res = await helper.apiClient.object('foo/bar');
      assert.deepEqual(res.hashes, { });
    });

  });

  suite('object method', function() {
    test('succeeds for an object that exists', async function() {
      await createTestObject('public/foo');
      const res = await helper.apiClient.object('public/foo');
      assert.equal(res.projectId, 'x');
      assert(new Date(res.expires) > new Date());
      assert.deepEqual(res.hashes, {});
    });

    test('contains hashes from upload', async function() {
      await createTestObject('public/foo', { hashes: { sha256 } });
      const res = await helper.apiClient.object('public/foo');
      assert.equal(res.projectId, 'x');
      assert(new Date(res.expires) > new Date());
      assert.deepEqual(res.hashes, { sha256 });
    });

    test('404s for an object that does not exist', async function() {
      await assert.rejects(
        () => helper.apiClient.object('public/foo'),
        err => err.statusCode === 404);
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

    test('startDownload fails when backend is not defined', async function() {
      await createTestObject('public/foo');
      await helper.setBackendConfig({ backends: {}, backendMap: [] });
      await assert.rejects(
        () => helper.apiClient.startDownload('public/foo', {
          acceptDownloadMethods: { 'simple': true },
        }),
        err => err.statusCode === 400);
    });

    test('startDownload for a supported method succeeds', async function() {
      const data = await createTestObject('public/foo');
      const res = await helper.apiClient.startDownload('public/foo', {
        acceptDownloadMethods: { 'simple': true },
      });
      assert.deepEqual(res, {
        method: 'simple',
        url: 'data:;base64,' + data.toString('base64'),
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
          acceptDownloadMethods: { simple: true },
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

    test('simple download fails when backend is not defined', async function() {
      await createTestObject('public/foo');
      await await helper.setBackendConfig({ backends: {}, backendMap: [] });
      await assert.rejects(
        () => helper.apiClient.download('public/foo'),
        err => err.statusCode === 400);
    });

    test('simple download for object that does not support the method returns 406', async function() {
      await createTestObject('has/no/methods');
      const downloadUrl = helper.apiClient.externalBuildSignedUrl(helper.apiClient.download, 'has/no/methods');
      const res = await request.get(downloadUrl).redirects(0).ok(res => res.status === 406);
      assert.equal(res.statusCode, 406);
    });
  });
});
