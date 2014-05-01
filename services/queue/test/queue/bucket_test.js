suite('queue/bucket', function() {
  var Bucket = require('../../queue/bucket');
  var AWS = require('aws-sdk-promise');

  var assert = require('assert');
  var config = require('../../config/test')();
  var s3 = new AWS.S3(config.get('aws'));
  var slugid = require('slugid');

  var subject;
  setup(function() {
    subject = new Bucket(s3, config.get('queue:taskBucket'));
  });

  suite('#publicUrl', function() {
    test('with a host', function() {
      var subject = new Bucket(
        s3,
        'magicfoo',
        'https://things'
      );

      assert.equal(
        subject.publicUrl('wootbar'),
        'https://things/wootbar'
      );
    });

    test('without a host', function() {
      var subject = new Bucket(
        s3,
        'magicfoo'
      );

      assert.equal(
        subject.publicUrl('thething'),
        // href always has a trailing slash
        s3.endpoint.href + 'thething'
      );
    });
  });

  test('#signedPutUrl', function() {
    return subject.signedPutUrl('/what').then(function(url) {
      assert.ok(url.indexOf('/what') !== -1);
    });
  });

  test('get with 404', function() {
    // NoSuchKey error should not throw
    return subject.get('wtfwhyisthishere').then(function(value) {
      assert.ok(!value);
    });
  });

  test('#get/put', function() {
    var obj = { woot: true };
    var path = slugid.v4() + '-from-a-test';
    return subject.put(path, obj).then(function() {
      return subject.get(path);
    }).then(function(result) {
      assert.deepEqual(result, obj);
    });
  });

});
