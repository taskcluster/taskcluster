suite('aws S3 (STS)', () => {
  var Promise     = require('promise');
  var assert      = require('assert');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var aws         = require('aws-sdk-promise');
  var helper      = require('./helper');
  var debug       = require('debug')('s3_test');

  var bucket = helper.cfg.test.testBucket;

  test('awsS3Credentials read-write folder1/folder2/', async () => {
    var id    = slugid.v4();
    var text  = slugid.v4();
    debug("### auth.awsS3Credentials");
    var result = await helper.auth.awsS3Credentials(
      'read-write',
      bucket,
      'folder1/folder2/'
    );
    assert(new Date(result.expires).getTime() > new Date().getTime(),
           "Expected expires to be in the future");

    // Create aws credentials
    var s3 = new aws.S3(result.credentials);
    debug("### s3.putObject");
    await s3.putObject({
      Bucket:   bucket,
      Key:      'folder1/folder2/' + id,
      Body:     text
    }).promise();

    debug("### s3.getObject");
    var res = await s3.getObject({
      Bucket:   bucket,
      Key:      'folder1/folder2/' + id,
    }).promise();
    assert(res.data.Body.toString() === text,
           "Got the wrong body!");

    debug("### s3.deleteObject");
    await s3.deleteObject({
      Bucket:   bucket,
      Key:      'folder1/folder2/' + id,
    }).promise();
  });

  test('awsS3Credentials read-write root', async () => {
    var id    = slugid.v4();
    var text  = slugid.v4();
    debug("### auth.awsS3Credentials");
    var result = await helper.auth.awsS3Credentials(
      'read-write',
      bucket,
      ''
    );
    assert(new Date(result.expires).getTime() > new Date().getTime(),
           "Expected expires to be in the future");

    // Create aws credentials
    var s3 = new aws.S3(result.credentials);
    debug("### s3.putObject");
    await s3.putObject({
      Bucket:   bucket,
      Key:      id,
      Body:     text
    }).promise();

    debug("### s3.getObject");
    var res = await s3.getObject({
      Bucket:   bucket,
      Key:      id,
    }).promise();
    assert(res.data.Body.toString() === text,
           "Got the wrong body!");

    debug("### s3.deleteObject");
    await s3.deleteObject({
      Bucket:   bucket,
      Key:      id,
    }).promise();
  });

  test('awsS3Credentials w. folder1/ access denied for folder2/', async () => {
    var id = slugid.v4();
    debug("### auth.awsS3Credentials");
    var result = await helper.auth.awsS3Credentials(
      'read-write',
      bucket,
      'folder1/'
    );
    assert(new Date(result.expires).getTime() > new Date().getTime(),
           "Expected expires to be in the future");

    // Create aws credentials
    var s3 = new aws.S3(result.credentials);
    debug("### s3.putObject");
    try {
      await s3.putObject({
        Bucket:   bucket,
        Key:      'folder2/' + id,
        Body:     "Hello-World"
      }).promise();
      assert(false, "Expected an error");
    } catch (err) {
      assert(err.statusCode === 403, "Expected 403 access denied");
    }
  });

  test('awsS3Credentials read-only folder1/ + (403 on write)', async () => {
    var id    = slugid.v4();
    var text  = slugid.v4();
    debug("### auth.awsS3Credentials");
    var result = await helper.auth.awsS3Credentials(
      'read-write',
      bucket,
      'folder1/'
    );
    var s3 = new aws.S3(result.credentials);
    debug("### s3.putObject");
    await s3.putObject({
      Bucket:   bucket,
      Key:      'folder1/' + id,
      Body:     text
    }).promise();

    debug("### auth.awsS3Credentials read-only");
    result = await helper.auth.awsS3Credentials(
      'read-only',
      bucket,
      'folder1/'
    );
    var s3 = new aws.S3(result.credentials);
    debug("### s3.getObject");
    var res = await s3.getObject({
      Bucket:   bucket,
      Key:      'folder1/' + id,
    }).promise();
    assert(res.data.Body.toString() === text,
           "Got the wrong body!");

    try {
      await s3.putObject({
        Bucket:   bucket,
        Key:      'folder1/' + slugid.v4(),
        Body:     "Hello-World"
      }).promise();
      assert(false, "Expected an error");
    } catch (err) {
      assert(err.statusCode === 403, "Expected 403 access denied");
    }
  });

  test('awsS3Credentials format=iam-role-compat', async () => {
    let id    = slugid.v4();
    let text  = slugid.v4();
    debug("### auth.awsS3Credentials w. format=iam-role-compat");
    let result = await helper.auth.awsS3Credentials(
      'read-write',
      bucket,
      '', {
      format: 'iam-role-compat',
    });

    let s3 = new aws.S3({
      accessKeyId:     result.AccessKeyId,
      secretAccessKey: result.SecretAccessKey,
      sessionToken:    result.Token,
    });
    debug("### s3.putObject");
    await s3.putObject({
      Bucket:   bucket,
      Key:      'folder1/' + id,
      Body:     text
    }).promise();
  });
});
