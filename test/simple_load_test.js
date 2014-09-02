suite('simple load', function() {
  var launch = require('./launch');
  var assert = require('assert');
  var createReq = require('./req');
  var readUntilEnd = require('./read_until_end');

  var handle;
  setup(function() {
    return launch().then(function(out) {
      handle = out;
    });
  });

  test('write until end / read until end', function(done) {
    var writes = 10;
    var req = createReq.input();
    var expected = '';

    function read() {
      var req = createReq.output();
      readUntilEnd(req).then(function(buffer) {
        assert.equal(expected, buffer);
        done()
      }).catch(done);
      req.end();
    }

    function write() {
      var msg  = 'wootbar ' + writes  + '\r\n';
      expected += msg;
      req.write(msg)
      if (writes-- > 0) {
        // wait for io to be done before writing again...
        process.nextTick(write)
      } else {
        req.end()
        req.once('response', function(res) {
          res.resume();
          res.once('end', read);
        });
      }
    }
    write()
  });

  teardown(function() {
    return handle.kill()
  });
});
