const helper = require('../helper');
const assert = require('assert');
const aws = require('aws-sdk');
const testing = require('taskcluster-lib-testing');
const taskcluster = require('taskcluster-client');

helper.secrets.mockSuite(testing.suiteName(), ['google'], function(mock, skipping) {
  if (mock) {
    // tests for this backend require real google cloud storage access, and
    // aren't even defined for the mock case
    return;
  }

  helper.withDb(mock, skipping);
  helper.withBackends(mock, skipping);

  let secret, s3;

  // unique object name prefix for this test run
  const prefix = taskcluster.slugid() + '/';

  suiteSetup(async function() {
    await helper.load('cfg');

    secret = helper.secrets.get('google');

    const credentials = {
      accessKeyId: secret.accessKeyId,
      secretAccessKey: secret.secretAccessKey,
    };
    const endpoint = new aws.Endpoint('https://storage.googleapis.com');
    s3 = new aws.S3({ endpoint, ...credentials });

    // set up a backend with a public bucket, and separately with a private
    // bucket; these are in fact the same bucket, and we'll just check that the
    // URLs have a signature for the non-public version.  S3 verifies
    // signatures if they are present, even if the signature is not required.
    helper.load.cfg('backends', {
      googlePrivate: {
        backendType: 'aws',
        accessKeyId: secret.accessKeyId,
        secretAccessKey: secret.secretAccessKey,
        bucket: secret.testBucket,
        signGetUrls: true,
        endpoint: 'https://storage.googleapis.com',
      },
      googlePublic: {
        backendType: 'aws',
        accessKeyId: secret.accessKeyId,
        secretAccessKey: secret.secretAccessKey,
        bucket: secret.testBucket,
        signGetUrls: false,
        endpoint: 'https://storage.googleapis.com',
      },
    });
    helper.load.cfg('backendMap', []);
  });

  const makeObject = async ({ name, data }) => {
    const projectId = 'test-proj';
    const expires = taskcluster.fromNow('1 hour');
    const uploadId = taskcluster.slugid();

    await helper.db.fns.create_object_for_upload(name, projectId, 'google', uploadId, expires, {}, expires);
    const [object] = await helper.db.fns.get_object_with_upload(name);

    await s3.putObject({
      Bucket: secret.testBucket,
      Key: name,
      Body: data,
    }).promise();

    await helper.db.fns.object_upload_complete(name, uploadId);

    return object;
  };

  const cleanup = async () => {
    await helper.resetTables();

    // delete all objects with this prefix
    const objects = await s3.listObjects({
      Bucket: secret.testBucket,
      Prefix: prefix,
    }).promise();
    for(let obj of objects.Contents) {
      await s3.deleteObject({
        Bucket: secret.testBucket,
        Key: obj.Key,
      }).promise();
    }
  };

  helper.testSimpleDownloadMethod({
    mock, skipping, prefix,
    title: 'public bucket',
    backendId: 'googlePublic',
    makeObject,
    async checkUrl({ name, url }) {
      // *not* signed
      assert(!url.match(/AccessKeyId=/), `got ${url}`);
      assert(!url.match(/Signature=/), `got ${url}`);
    },
  }, async function() {
    teardown(cleanup);
  });

  helper.testSimpleDownloadMethod({
    mock, skipping, prefix,
    title: 'private bucket',
    backendId: 'googlePrivate',
    makeObject,
    async checkUrl({ name, url }) {
      // ..contains S3 signature query args (note that testSimpleDownloadMethod
      // will verify that the URL actually works; this just verifies that it
      // is not un-signed).
      assert(url.match(/AccessKeyId=/), `got ${url}`);
      assert(url.match(/Signature=/), `got ${url}`);
    },
  }, async function() {
    teardown(cleanup);
  });

  helper.testTemporaryUpload({
    mock, skipping, prefix,
    backendId: 'googlePrivate',
    async getObjectContent({ name }) {
      const res = await s3.getObject({
        Bucket: secret.testBucket,
        Key: name,
      }).promise();
      return res.Body;
    },
  }, async function() {
    teardown(cleanup);
  });

  suite('expireObject', function() {
    teardown(cleanup);

    test('expires an object', async function() {
      const name = 'some/object';
      const object = await makeObject({ name, data: Buffer.from('abc') });

      const backends = await helper.load('backends');
      const backend = backends.get('googlePrivate');

      assert(await backend.expireObject(object));

      // object should now be gone
      await assert.rejects(() => s3.getObject({
        Bucket: secret.testBucket,
        Key: name,
      }).promise(),
      err => err.code === 'NoSuchKey');
    });

    test('succeeds for an object that no longer exists', async function() {
      const name = 'some/object';
      const uploadId = taskcluster.slugid();
      await helper.db.fns.create_object_for_upload(
        name, 'test-proj', 'google', uploadId,
        taskcluster.fromNow('1 hour'), {}, taskcluster.fromNow('1 hour'));
      await helper.db.fns.object_upload_complete(name, uploadId);
      const [object] = await helper.db.fns.get_object_with_upload(name);

      const backends = await helper.load('backends');
      const backend = backends.get('googlePrivate');

      assert(await backend.expireObject(object));
    });
  });
});
