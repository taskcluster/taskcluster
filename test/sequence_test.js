suite('sequence verification', function() {
  var launch = require('./launch');
  var assert = require('assert');
  var createReq = require('./req');
  var waitForPort = require('./wait_for_port');
  var readUntilEnd = require('./read_until_end');
  var verifySeq = require('./sequence_verify')

  var handle;
  setup(function() {
    return launch().then(function(out) {
      handle = out;
    });
  });

  var MAX_WRITE = 10;
  test('read ' + MAX_WRITE + ' sequences', function(done) {
    var writes = 0;

    var req = createReq.input();

    function write(callback) {
      var msg  = 'wootbar|' + writes  + '\n';
      req.write(msg, callback);

      if (++writes < MAX_WRITE) {
        process.nextTick(write);
      } else {
        req.end();
      }
    }

    write();

    waitForPort(60023).then(function() {
      var output = createReq.output();
      output.once('error', done);
      output.once('response', function(res) {
        var verify = verifySeq(res);
        verify.once('error', done);
        verify.on('sequence', function(seq) {
          if (seq === MAX_WRITE - 1) done();
        });
      });
      output.end();
    });
  });

  teardown(function() {
    return handle.kill()
  });
});
