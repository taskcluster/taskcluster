suite('aws S3 (STS)', function() {
  var Promise     = require('promise');
  var assert      = require('assert');
  var helper      = require('./helper');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var aws         = require('aws-sdk-promise');
  var subject     = helper.setup({title: "aws-tests"});
  var debug       = require('debug')('s3_test');

  var bucket = subject.cfg.get('test:testBucket');

  test('awsS3Credentials read-write folder1/folder2/', function() {
    var id    = slugid.v4();
    var text  = slugid.v4();
    debug("### auth.awsS3Credentials");
    return subject.auth.awsS3Credentials(
      'read-write',
      bucket,
      'folder1/folder2/'
    ).then(function(result) {
      assert(new Date(result.expires).getTime() > new Date().getTime(),
             "Expected expires to be in the future");

      // Create aws credentials
      var s3 = new aws.S3(result.credentials);
      debug("### s3.putObject");
      return s3.putObject({
        Bucket:   bucket,
        Key:      'folder1/folder2/' + id,
        Body:     text
      }).promise().then(function() {
        debug("### s3.getObject");
        return s3.getObject({
          Bucket:   bucket,
          Key:      'folder1/folder2/' + id,
        }).promise().then(function(res) {
          assert(res.data.Body.toString() === text,
                 "Got the wrong body!");
        });
      }).then(function() {
        debug("### s3.deleteObject");
        return s3.deleteObject({
          Bucket:   bucket,
          Key:      'folder1/folder2/' + id,
        }).promise();
      });
    });
  });

  test('awsS3Credentials read-write root', function() {
    var id    = slugid.v4();
    var text  = slugid.v4();
    debug("### auth.awsS3Credentials");
    return subject.auth.awsS3Credentials(
      'read-write',
      bucket,
      ''
    ).then(function(result) {
      assert(new Date(result.expires).getTime() > new Date().getTime(),
             "Expected expires to be in the future");

      // Create aws credentials
      var s3 = new aws.S3(result.credentials);
      debug("### s3.putObject");
      return s3.putObject({
        Bucket:   bucket,
        Key:      id,
        Body:     text
      }).promise().then(function() {
        debug("### s3.getObject");
        return s3.getObject({
          Bucket:   bucket,
          Key:      id,
        }).promise().then(function(res) {
          assert(res.data.Body.toString() === text,
                 "Got the wrong body!");
        });
      }).then(function() {
        debug("### s3.deleteObject");
        return s3.deleteObject({
          Bucket:   bucket,
          Key:      id,
        }).promise();
      });
    });
  });

  test('awsS3Credentials w. folder1/ access denied for folder2/', function() {
    var id = slugid.v4();
    debug("### auth.awsS3Credentials");
    return subject.auth.awsS3Credentials(
      'read-write',
      bucket,
      'folder1/'
    ).then(function(result) {
      assert(new Date(result.expires).getTime() > new Date().getTime(),
             "Expected expires to be in the future");

      // Create aws credentials
      var s3 = new aws.S3(result.credentials);
      debug("### s3.putObject");
      return s3.putObject({
        Bucket:   bucket,
        Key:      'folder2/' + id,
        Body:     "Hello-World"
      }).promise().then(function() {
        assert(false, "Expected an error");
      }, function(res) {
        assert(res.statusCode === 403, "Expected 403 access denied");
      });
    });
  });

  test('awsS3Credentials read-only folder1/ + (403 on write)', function() {
    var id    = slugid.v4();
    var text  = slugid.v4();
    debug("### auth.awsS3Credentials");
    return subject.auth.awsS3Credentials(
      'read-write',
      bucket,
      'folder1/'
    ).then(function(result) {
      var s3 = new aws.S3(result.credentials);
      debug("### s3.putObject");
      return s3.putObject({
        Bucket:   bucket,
        Key:      'folder1/' + id,
        Body:     text
      }).promise();
    }).then(function() {
      debug("### auth.awsS3Credentials read-only");
      return subject.auth.awsS3Credentials(
        'read-only',
        bucket,
        'folder1/'
      ).then(function(result) {
        var s3 = new aws.S3(result.credentials);
        debug("### s3.getObject");
        return s3.getObject({
          Bucket:   bucket,
          Key:      'folder1/' + id,
        }).promise().then(function(res) {
          assert(res.data.Body.toString() === text,
                 "Got the wrong body!");
        }).then(function() {
          return s3.putObject({
            Bucket:   bucket,
            Key:      'folder1/' + slugid.v4(),
            Body:     "Hello-World"
          }).promise().then(function() {
            assert(false, "Expected an error");
          }, function(res) {
            assert(res.statusCode === 403, "Expected 403 access denied");
          });
        });
      });
    });
  });
});