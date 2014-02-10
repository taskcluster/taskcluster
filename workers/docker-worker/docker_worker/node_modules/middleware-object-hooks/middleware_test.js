suite('middleware', function() {

  suite('sync only', function() {
    var subject = require('./examples/multiple_handlers');

    test('start then end', function() {
      var now = Date.now();
      return subject.run('start', {}).then(
        function(result) {
          return subject.run('end', result);
        }
      ).then(
        function(result) {
          assert.deepEqual(result, { started: true, ended: true, calls: 2 });
        }
      );
    });
  });

  test('async (promise) hooks', function() {
    var subject = require('./examples/async_handler');

    var value = 'iwazsent';
    return subject.run('echo', value).then(
      function(result) {
        assert.equal(result, value);
      }
    );
  });

  test('error in sub hook', function() {
    var subject = require('./')();
    subject.use({
      error: function() { return 'not it'; }
    });

    var err = new Error('errz');
    subject.use({
      error: function() { throw err; }
    });

    return subject.run('error').then(
      function(value) {
        throw new Error('expected a thrown error got: ' + value);
      },
      function(thrownErr) {
        assert.equal(err, thrownErr);
      }
    );
  });

  test('no hooks', function() {
    var subject = require('./')();
    return subject.run('nohooks', {}).then(
      function(value) {
        assert.deepEqual(value, {});
      }
    );
  });
});
