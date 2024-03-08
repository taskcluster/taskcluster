import assert from 'assert';
import slugid from 'slugid';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import helper from './helper.js';
import debugFactory from 'debug';
const debug = debugFactory('s3_test');
import testing from 'taskcluster-lib-testing';

helper.secrets.mockSuite(testing.suiteName(), ['azure', 'gcp'], function(mock, skipping) {
  if (mock) {
    return; // This is actually testing sts tokens and we are not going to mock those
  }
  // pulse/azure aren't under test, so we always mock them out
  helper.withDb(mock, skipping);
  helper.withCfg(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withServers(mock, skipping);

  let bucket;
  setup(function() {
    const secret = helper.secrets.get('aws');
    bucket = secret.testBucket;
    helper.load.cfg('awsCredentials.allowedBuckets', [{
      accessKeyId: secret.awsAccessKeyId,
      secretAccessKey: secret.awsSecretAccessKey,
      buckets: [secret.testBucket] }]);
  });

  test('awsS3Credentials read-write folder1/folder2/', async () => {
    let id = slugid.v4();
    let text = slugid.v4();
    debug('### auth.awsS3Credentials');
    let result = await helper.apiClient.awsS3Credentials(
      'read-write',
      bucket,
      'folder1/folder2/',
    );
    assert(new Date(result.expires).getTime() > new Date().getTime(),
      'Expected expires to be in the future');

    // Create aws credentials
    let s3 = new S3Client({
      credentials: {
        ...result.credentials,
      },
      region: 'us-east-1',
      followRegionRedirects: true,
    });
    debug('### s3.putObject');
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: 'folder1/folder2/' + id,
      Body: text,
    }));

    debug('### s3.getObject');
    let res = await s3.send(new GetObjectCommand({
      Bucket: bucket,
      Key: 'folder1/folder2/' + id,
    }));
    assert(await res.Body.transformToString() === text, 'Got the wrong body!');

    debug('### s3.deleteObject');
    await s3.send(new DeleteObjectCommand({
      Bucket: bucket,
      Key: 'folder1/folder2/' + id,
    }));
  });

  test('awsS3Credentials read-write root', async () => {
    let id = slugid.v4();
    let text = slugid.v4();
    debug('### auth.awsS3Credentials');
    let result = await helper.apiClient.awsS3Credentials(
      'read-write',
      bucket,
      '',
    );
    assert(new Date(result.expires).getTime() > new Date().getTime(),
      'Expected expires to be in the future');

    // Create aws credentials
    let s3 = new S3Client({
      credentials: {
        ...result.credentials,
      },
      region: 'us-east-1',
      followRegionRedirects: true,
    });
    debug('### s3.putObject');
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: id,
      Body: text,
    }));

    debug('### s3.getObject');
    let res = await s3.send(new GetObjectCommand({
      Bucket: bucket,
      Key: id,
    }));
    assert(await res.Body.transformToString() === text,
      'Got the wrong body!');

    debug('### s3.deleteObject');
    await s3.send(new DeleteObjectCommand({
      Bucket: bucket,
      Key: id,
    }));
  });

  test('awsS3Credentials w. folder1/ access denied for folder2/', async () => {
    let id = slugid.v4();
    debug('### auth.awsS3Credentials');
    let result = await helper.apiClient.awsS3Credentials(
      'read-write',
      bucket,
      'folder1/',
    );
    assert(new Date(result.expires).getTime() > new Date().getTime(),
      'Expected expires to be in the future');

    // Create aws credentials
    let s3 = new S3Client({
      credentials: {
        ...result.credentials,
      },
      region: 'us-east-1',
      followRegionRedirects: true,
    });
    debug('### s3.putObject');
    try {
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: 'folder2/' + id,
        Body: 'Hello-World',
      }));
      assert(false, 'Expected an error');
    } catch (err) {
      assert(err.Code === 'AccessDenied', 'Expected 403 access denied');
    }
  });

  test('awsS3Credentials read-only folder1/ + (403 on write)', async () => {
    let id = slugid.v4();
    let text = slugid.v4();
    debug('### auth.awsS3Credentials');
    let result = await helper.apiClient.awsS3Credentials(
      'read-write',
      bucket,
      'folder1/',
    );
    let s3 = new S3Client({
      credentials: {
        ...result.credentials,
      },
      region: 'us-east-1',
      followRegionRedirects: true,
    });
    debug('### s3.putObject');
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: 'folder1/' + id,
      Body: text,
    }));

    debug('### auth.awsS3Credentials read-only');
    result = await helper.apiClient.awsS3Credentials(
      'read-only',
      bucket,
      'folder1/',
    );
    s3 = new S3Client({
      credentials: {
        ...result.credentials,
      },
      region: 'us-east-1',
      followRegionRedirects: true,
    });
    debug('### s3.getObject');
    let res = await s3.send(new GetObjectCommand({
      Bucket: bucket,
      Key: 'folder1/' + id,
    }));
    assert(await res.Body.transformToString() === text,
      'Got the wrong body!');

    try {
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: 'folder1/' + slugid.v4(),
        Body: 'Hello-World',
      }));
      assert(false, 'Expected an error');
    } catch (err) {
      assert(err.Code === 'AccessDenied', 'Expected 403 access denied');
    }
  });

  test('awsS3Credentials format=iam-role-compat', async () => {
    let id = slugid.v4();
    let text = slugid.v4();
    debug('### auth.awsS3Credentials w. format=iam-role-compat');
    let result = await helper.apiClient.awsS3Credentials(
      'read-write',
      bucket,
      '', {
        format: 'iam-role-compat',
      });

    let s3 = new S3Client({
      credentials: {
        accessKeyId: result.AccessKeyId,
        secretAccessKey: result.SecretAccessKey,
        sessionToken: result.Token,
      },
      region: 'us-east-1',
      followRegionRedirects: true,
    });
    debug('### s3.putObject');
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: 'folder1/' + id,
      Body: text,
    }));
  });

  test('awsS3Credentials with unknown bucket', async () => {
    await assert.rejects(
      () => helper.apiClient.awsS3Credentials('read-write', 'nosuchbucket', ''),
      err => err.statusCode === 404);
  });
});
