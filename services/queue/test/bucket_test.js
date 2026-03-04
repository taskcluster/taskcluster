import slugid from 'slugid';
import assert from 'assert';
import Bucket from '../src/bucket.js';
import debugFactory from 'debug';
const debug = debugFactory('test:bucket_test');
import request from 'superagent';
import helper from './helper.js';
import testing from '@taskcluster/lib-testing';

helper.secrets.mockSuite(testing.suiteName(), ['aws'], function(mock, skipping) {
  helper.withS3(mock, skipping);

  if (mock) {
    // aws-mock-s3 is not sufficient to test this class, and there's really no
    // way to mock the signed URL generation, anyway, which is most of what
    // this class does..
    return;
  }

  let bucket;
  setup('load bucket', async function() {
    if (!skipping()) {
      bucket = await helper.load('publicArtifactBucket');
    }
  });

  // Test that put to signed url works
  test('createPutUrl', async function() {
    const key = slugid.v4();
    const url = await bucket.createPutUrl(key, {
      contentType: 'application/json',
      expires: 60 * 10,
    });
    await request.put(url).send({ message: 'Hello' });
  });

  const uploadTestFile = async () => {
    const key = slugid.v4();
    const url = await bucket.createPutUrl(key, {
      contentType: 'application/json',
      expires: 60 * 10,
    });
    await request.put(url).send({ message: 'Hello' });
    return { key, url };
  };

  // Test we can delete an object
  test('deleteObject', async function() {
    const { key } = await uploadTestFile();
    await bucket.deleteObject(key);
  });

  // Test we can delete an object a non-existing object
  test('deleteObject (non-existing object)', async function() {
    const key = slugid.v4();
    await bucket.deleteObject(key);
  });

  // Test we can delete multiple objects
  test('deleteObjects', async function () {
    const { key: key1 } = await uploadTestFile();
    const { key: key2 } = await uploadTestFile();

    await bucket.deleteObjects([key1, key2]);
  });
  test('deleteObjects quiet', async function () {
    const { key: key1 } = await uploadTestFile();
    const { key: key2 } = await uploadTestFile();

    await bucket.deleteObjects([key1, key2], true);
  });

  test('createGetUrl', async function() {
    const key = slugid.v4();
    const putUrl = await bucket.createPutUrl(key, {
      contentType: 'application/json',
      expires: 60 * 10,
    });

    let res = await request.put(putUrl).send({ message: 'Hello' });
    assert(res.ok, 'put request failed');

    const getUrl = await bucket.createGetUrl(key);
    debug('createGetUrl -> %s', getUrl);

    res = await request.get(getUrl);
    assert(res.ok, 'get request failed');
    assert(res.body.message === 'Hello', 'wrong message');
  });

  test('uses bucketCDN', async function() {
    const cfg = await helper.load('cfg');

    // Create bucket instance
    const bucket = new Bucket({
      bucket: cfg.app.publicArtifactBucket,
      awsOptions: cfg.aws,
      bucketCDN: 'https://example.com',
      monitor: await helper.load('monitor'),
    });
    const url = await bucket.createGetUrl('test');
    assert(url === 'https://example.com/test');
    const urlWithSpaces = await bucket.createGetUrl('test with spaces');
    assert(urlWithSpaces === 'https://example.com/test%20with%20spaces');
  });

  test('default endpoint', async function() {
    const cfg = await helper.load('cfg');

    // Create bucket instance
    const bucket = new Bucket({
      bucket: cfg.app.publicArtifactBucket,
      awsOptions: cfg.aws,
      monitor: await helper.load('monitor'),
    });
    const url = await bucket.createGetUrl('testX');
    assert.equal(url, `https://${cfg.app.publicArtifactBucket}.s3.${cfg.aws.region}.amazonaws.com/testX`);
  });

  test('handles slashes', async function() {
    const cfg = await helper.load('cfg');

    // Create bucket instance
    const bucket = new Bucket({
      bucket: cfg.app.publicArtifactBucket,
      awsOptions: {
        ...cfg.aws,
        endpoint: 'http://taskcluster',
        s3ForcePathStyle: true,
      },
      monitor: await helper.load('monitor'),
    });
    const url = await bucket.createGetUrl('testX');
    assert.equal(url, `http://taskcluster/${cfg.app.publicArtifactBucket}/testX`);
  });

  test('custom endpoint + forcePathStyle', async function() {
    const cfg = await helper.load('cfg');
    const customEndpoint = 'http://localhost:45678';

    // Create bucket instance
    const bucket = new Bucket({
      bucket: cfg.app.publicArtifactBucket,
      awsOptions: {
        ...cfg.aws,
        endpoint: customEndpoint,
        s3ForcePathStyle: true,
      },
      monitor: await helper.load('monitor'),
    });
    const url = await bucket.createGetUrl('/testX');
    assert.equal(url, `${customEndpoint}/${cfg.app.publicArtifactBucket}/testX`);
  });
});
