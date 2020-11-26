const helper = require('../helper');
const assert = require('assert');
const aws = require('aws-sdk');
const testing = require('taskcluster-lib-testing');
const taskcluster = require('taskcluster-client');
const { getBucketRegion } = require('../../src/backends/aws');

helper.secrets.mockSuite(testing.suiteName(), ['aws'], function(mock, skipping) {
  if (mock) {
    // tests for this backend require real AWS access, and aren't even defined
    // for the mock case
    return;
  }

  helper.withDb(mock, skipping);
  helper.withBackends(mock, skipping);

  let secret, s3;

  // unique object name prefix for this test run
  const prefix = taskcluster.slugid() + '/';

  suiteSetup(async function() {
    await helper.load('cfg');

    secret = helper.secrets.get('aws');

    const credentials = {
      accessKeyId: secret.accessKeyId,
      secretAccessKey: secret.secretAccessKey,
    };
    const region = await getBucketRegion({ bucket: secret.testBucket, credentials });
    s3 = new aws.S3({ region, ...credentials });

    // set up a backend with a public bucket, and separately with a private
    // bucket; these are in fact the same bucket, and we'll just check that the
    // URLs have a signature for the non-public version.  S3 verifies
    // signatures if they are present, even if the signature is not required.
    helper.load.cfg('backends', {
      awsPrivate: {
        backendType: 'aws',
        accessKeyId: secret.accessKeyId,
        secretAccessKey: secret.secretAccessKey,
        bucket: secret.testBucket,
        signGetUrls: true,
      },
      awsPublic: {
        backendType: 'aws',
        accessKeyId: secret.accessKeyId,
        secretAccessKey: secret.secretAccessKey,
        bucket: secret.testBucket,
        signGetUrls: false,
      },
    });
    helper.load.cfg('backendMap', []);
  });

  const makeObject = async ({ name, data }) => {
    const projectId = 'test-proj';
    const expires = taskcluster.fromNow('1 hour');

    await helper.db.fns.create_object(name, projectId, 'aws', {}, expires);
    const [object] = await helper.db.fns.get_object(name);

    await s3.putObject({
      Bucket: secret.testBucket,
      Key: name,
      Body: data,
    }).promise();

    return object;
  };

  const cleanup = async () => {
    await helper.resetTables();

    // delete all objects with this prefix
    const objects = await s3.listObjects({
      Bucket: secret.testBucket,
      Prefix: prefix,
    }).promise();
    if (objects.Contents.length > 0) {
      await s3.deleteObjects({
        Bucket: secret.testBucket,
        Delete: {
          Objects: objects.Contents.map(o => ({ Key: o.Key })),
        },
      }).promise();
    }
  };

  helper.testSimpleDownloadMethod({
    mock, skipping, prefix,
    title: 'public bucket',
    backendId: 'awsPublic',
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
    backendId: 'awsPrivate',
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
    backendId: 'awsPrivate',
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
      const backend = backends.get('awsPrivate');

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
      await helper.db.fns.create_object(name, 'test-proj', 'aws', {}, taskcluster.fromNow('1 hour'));
      const [object] = await helper.db.fns.get_object(name);

      const backends = await helper.load('backends');
      const backend = backends.get('awsPrivate');

      assert(await backend.expireObject(object));
    });
  });
});
