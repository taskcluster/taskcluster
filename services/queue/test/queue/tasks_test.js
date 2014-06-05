suite('queue/bucket', function() {
  var Tasks     = require('../../queue/tasks');
  var assert    = require('assert');
  var base      = require('taskcluster-base');
  var slugid    = require('slugid');
  var request   = require('superagent-promise');

  // Load configuration
  var cfg = base.config({
    defaults:     require('../../config/defaults'),
    profile:      require('../../config/' + 'test'),
    filename:     'taskcluster-queue'
  });

  var subject;
  setup(function() {
    subject = new Tasks({
      aws:                cfg.get('aws'),
      bucket:             cfg.get('queue:tasks:bucket'),
      publicBaseUrl:      cfg.get('queue:tasks:publicBaseUrl')
    });
  });

  suite('#publicUrl', function() {
    test('with a host', function() {
      var subject = new Tasks({
        aws:                cfg.get('aws'),
        bucket:             'magicfoo',
        publicBaseUrl:      'https://things'
      });

      assert.equal(
        subject.publicUrl('wootbar'),
        'https://things/wootbar'
      );
    });

    test('without a host', function() {
      var subject = new Tasks({
        aws:                cfg.get('aws'),
        bucket:             cfg.get('queue:tasks:bucket')
      });
      var path = 'storage-test/' + slugid.v4();
      return subject.put(path, "Hello World").then(function() {
        return request
                .get(subject.publicUrl(path))
                .end().then(function(res) {
          assert(res.body === "Hello World", "Didn't get Hello World");
        });
      });
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
