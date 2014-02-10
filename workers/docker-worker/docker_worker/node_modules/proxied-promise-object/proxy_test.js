suite('proxy', function() {
  var proxy = require('./');
  var Promise = require('promise');
  var fs = require('fs');
  var fsP = proxy(Promise, fs);

  test('successful promise', function(done) {
    var expected = fs.readFileSync('package.json', 'utf8');

    fsP.readFile('package.json', 'utf8').then(
      function(value) {
        assert.equal(value, expected);
        done();
      }
    );
  });

  suite('unsuccessful promise', function() {
    var expected;
    setup(function(done) {
      fs.readFile('INOHERE', function(err) {
        assert.ok(err);
        expected = err;
        done();
      });
    });

    test('passes errors', function(done) {
      fsP.readFile('INOHERE').then(null, function(err) {
        assert.deepEqual(expected, err);
        done();
      });
    });
  });

  test('sync error from proxied object', function(done) {
    var err = new Error('WTFD');
    var obj = proxy(Promise, {
      throws: function() {
        throw err;
      }
    });

    obj.throws().then(null, function(given) {
      assert.equal(err, given);
      done();
    });
  });

  test('avoid double wrapping the object', function() {
    var anotherFsP = proxy(Promise, fsP);
    assert.equal(anotherFsP, fsP);
  });
});
