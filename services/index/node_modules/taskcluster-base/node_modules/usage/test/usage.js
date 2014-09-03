var usage   = require('../');
var assert  = require('assert');

suite('Usage', function() {
  test('invalid pid', function(done) {
    usage.lookup(1232323, function(err, result) {
      assert.ok(err.message);
      done();
    });
  });

  test('valid pid', function(done) {
    usage.lookup(process.pid, function(err, result) {
      assert.ifError(err);
      assert.ok(result.cpu >= 0);
      assert.ok(result.memory > 0);
      done();
    });
  });

  if(process.platform == 'linux') {
    test('valid pid - with keepHistory', function(done) {
      var options = { keepHistory: true };
      usage.lookup(process.pid, options, function(err, result) {
        assert.ifError(err);
        assert.ok(result.cpu >= 0);
        assert.ok(result.memory > 0);
        usage.clearHistory();
        done();
      });
    });
  }
});
