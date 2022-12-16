const helper = require('../helper');
const assert = require('assert');
const aws = require('aws-sdk');
const testing = require('taskcluster-lib-testing');
const taskcluster = require('taskcluster-client');
const { AwsBackend, getBucketRegion } = require('../../src/backends/aws');
const { promisify } = require('util');
const zlib = require('zlib');

const gzip = promisify(zlib.gzip);

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
  });

  setup(async function() {
    // set up a backend with a public bucket, and separately with a private
    // bucket; these are in fact the same bucket, and we'll just check that the
    // URLs have a signature for the non-public version.  S3 verifies
    // signatures if they are present, even if the signature is not required.
    await helper.setBackendConfig({
      backends: {
        awsPrivate: {
          backendType: 'aws',
          accessKeyId: secret.accessKeyId,
          secretAccessKey: secret.secretAccessKey,
          bucket: secret.testBucket,
          signGetUrls: true,
          tags: { Extra: 'yes' },
        },
        awsPublic: {
          backendType: 'aws',
          accessKeyId: secret.accessKeyId,
          secretAccessKey: secret.secretAccessKey,
          bucket: secret.testBucket,
          signGetUrls: false,
          tags: { Extra: 'yes' },
        },
      },
      backendMap: [],
    });
  });

  const projectId = 'test-proj';

  const makeObject = async ({ name, data, hashes, gzipped }) => {
    const expires = taskcluster.fromNow('1 hour');
    const uploadId = taskcluster.slugid();

    await helper.db.fns.create_object_for_upload(name, projectId, 'aws', uploadId, expires, {}, expires);
    const [object] = await helper.db.fns.get_object_with_upload(name);

    if (gzipped) {
      const compressedData = await gzip(data);
      await s3.putObject({
        Bucket: secret.testBucket,
        Key: name,
        Body: compressedData,
        ContentEncoding: "gzip",
      }).promise();
    } else {
      await s3.putObject({
        Bucket: secret.testBucket,
        Key: name,
        Body: data,
      }).promise();
    }

    if (hashes) {
      await helper.db.fns.add_object_hashes({ name_in: name, hashes_in: hashes });
    }

    await helper.db.fns.object_upload_complete(name, uploadId);

    return object;
  };

  const getObjectContent = async ({ name }) => {
    const res = await s3.getObject({
      Bucket: secret.testBucket,
      Key: name,
    }).promise();

    // verify tagging is as expected
    const tagging = await s3.getObjectTagging({
      Bucket: secret.testBucket,
      Key: name,
    }).promise();
    assert(
      tagging.TagSet.some(({ Key, Value }) => Key === 'ProjectId' && Value === 'test-proj') &&
      tagging.TagSet.some(({ Key, Value }) => Key === 'Extra' && Value === 'yes'),
      `got tags ${JSON.stringify(tagging)}`);

    const head = await s3.headObject({
      Bucket: secret.testBucket,
      Key: name,
    }).promise();

    return { data: res.Body, contentType: res.ContentType, contentDisposition: head.ContentDisposition };
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

  suite('setup', function() {
    test('invalid tags are rejected', async function() {
      const backend = new AwsBackend({
        backendId: 'broken',
        db: helper.db,
        monitor: {},
        rootUrl: 'https://example.com',
        config: {
          backendType: 'aws',
          accessKeyId: secret.accessKeyId,
          secretAccessKey: secret.secretAccessKey,
          bucket: secret.testBucket,
          signGetUrls: true,
          tags: { Extra: ['not', 'string'] },
        },
      });
      await assert.rejects(
        () => backend.setup(),
        /backend broken has invalid 'tags' configuration/);
    });
  });

  helper.testBackend({
    mock, skipping, prefix,
    backendId: 'awsPublic',
    makeObject,
  }, async function() {
    teardown(cleanup);
  });

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

  helper.testGetUrlDownloadMethod({
    mock, skipping, prefix,
    backendId: 'awsPrivate',
    makeObject,
    async checkUrl({ name, url }) {
      // URL should always be signed
      assert(url.match(/AccessKeyId=/), `got ${url}`);
      assert(url.match(/Signature=/), `got ${url}`);
    },
  }, async function() {
    teardown(cleanup);
  });

  helper.testDataInlineUpload({
    mock, skipping, prefix,
    backendId: 'awsPrivate',
    getObjectContent,
  }, async function() {
    teardown(cleanup);
  });

  helper.testPutUrlUpload({
    mock, skipping, prefix,
    backendId: 'awsPrivate',
    getObjectContent,
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
      const uploadId = taskcluster.slugid();
      await helper.db.fns.create_object_for_upload(
        name, 'test-proj', 'aws', uploadId,
        taskcluster.fromNow('1 hour'), {}, taskcluster.fromNow('1 hour'));
      await helper.db.fns.object_upload_complete(name, uploadId);
      const [object] = await helper.db.fns.get_object_with_upload(name);

      const backends = await helper.load('backends');
      const backend = backends.get('awsPrivate');

      assert(await backend.expireObject(object));
    });
  });
});
