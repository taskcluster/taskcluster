import helper from '../helper/index.js';
import assert from 'assert';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  GetObjectTaggingCommand,
  HeadObjectCommand,
  ListObjectsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import testing from 'taskcluster-lib-testing';
import taskcluster from 'taskcluster-client';
import { AwsBackend, getBucketRegion } from '../../src/backends/aws.js';
import { promisify } from 'util';
import zlib from 'zlib';

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

    const options = {
      credentials: {
        accessKeyId: secret.accessKeyId,
        secretAccessKey: secret.secretAccessKey,
      },
      region: 'us-east-1',
      followRegionRedirects: true,
    };
    const region = await getBucketRegion({
      bucket: secret.testBucket,
      ...options,
    });
    options.region = region;
    s3 = new S3Client(options);
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
      await s3.send(new PutObjectCommand({
        Bucket: secret.testBucket,
        Key: name,
        Body: compressedData,
        ContentEncoding: "gzip",
      }));
    } else {
      await s3.send(new PutObjectCommand({
        Bucket: secret.testBucket,
        Key: name,
        Body: data,
      }));
    }

    if (hashes) {
      await helper.db.fns.add_object_hashes({ name_in: name, hashes_in: hashes });
    }

    await helper.db.fns.object_upload_complete(name, uploadId);

    return object;
  };

  const getObjectContent = async ({ name }) => {
    const res = await s3.send(new GetObjectCommand({
      Bucket: secret.testBucket,
      Key: name,
    }));

    // verify tagging is as expected
    const tagging = await s3.send(new GetObjectTaggingCommand({
      Bucket: secret.testBucket,
      Key: name,
    }));
    assert(
      tagging.TagSet.some(({ Key, Value }) => Key === 'ProjectId' && Value === 'test-proj') &&
      tagging.TagSet.some(({ Key, Value }) => Key === 'Extra' && Value === 'yes'),
      `got tags ${JSON.stringify(tagging)}`);

    const head = await s3.send(new HeadObjectCommand({
      Bucket: secret.testBucket,
      Key: name,
    }));

    return {
      data: await res.Body.transformToByteArray(),
      contentType: res.ContentType,
      contentDisposition: head.ContentDisposition,
    };
  };

  const cleanup = async () => {
    await helper.resetTables();

    // delete all objects with this prefix
    const objects = await s3.send(new ListObjectsCommand({
      Bucket: secret.testBucket,
      Prefix: prefix,
    }));
    if (objects.Contents?.length > 0) {
      await s3.send(new DeleteObjectsCommand({
        Bucket: secret.testBucket,
        Delete: {
          Objects: objects.Contents.map(o => ({ Key: o.Key })),
        },
      }));
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
      assert(!url.match(/X-Amz-Credential=/), `got ${url}`);
      assert(!url.match(/X-Amz-Signature=/), `got ${url}`);
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
      assert(url.match(/X-Amz-Credential=/), `got ${url}`);
      assert(url.match(/X-Amz-Signature=/), `got ${url}`);
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
      assert(url.match(/X-Amz-Credential=/), `got ${url}`);
      assert(url.match(/X-Amz-Signature=/), `got ${url}`);
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
      await assert.rejects(() => s3.send(new GetObjectCommand({
        Bucket: secret.testBucket,
        Key: name,
      })),
      err => err.Code === 'NoSuchKey');
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
