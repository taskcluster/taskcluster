suite('byte range fetches', function() {
  var util = require('util');
  var launch = require('./launch');
  var assert = require('assert');
  var createReq = require('./req');
  var waitForPort = require('./wait_for_port');
  var readUntilEnd = require('./read_until_end');
  var Promise = require('promise');
  var verifySeq = require('./sequence_verify')

  function readAll(options) {
    return new Promise(function(accept, reject) {
      waitForPort(60023).then(function() {
        var output = createReq.output(options);
        readUntilEnd(output).then(accept, reject);
        output.end();
      }).catch(reject);
    });
  }

  var handle;
  setup(function() {
    return launch().then(function(out) {
      handle = out;
    });
  });

  function range(start, end) {
    var output = [];
    for (var i = start; i <= end; i++) {
      output.push(i)
    }
    return output;
  }

  // Finds the _starting_ position of the given number.
  function byteOffset(number) {
    var last = 0
    var offset = 0;
    for (var i = 0; i <= number; i++) {
      offset += last
      last = Buffer.byteLength(i + '\n')
    }
    return offset;
  }

  function writeAll(range) {
    var req = createReq.input();
    // Eat any write errors we don't care about them in this instance all we
    // care about is that we get the correct bytes back in the response.
    req.once('error', function() {})
    function write() {
      var msg = range.shift();
      // intentional use of !=
      if (msg != null) {
        req.write(msg + '\n');
        setTimeout(function() {
          process.nextTick(write);
        });
      } else {
        req.end();
      }
    }
    write();
  }

  test('start no end', function() {
    var rangeStart = 200;
    var rangeEnd = 400;

    var contents = range(0, 400);
    var expectedWrites = new Buffer(contents.join('\n') + '\n');

    var expected = expectedWrites.slice(
      byteOffset(rangeStart), byteOffset(rangeEnd + 1)
    ).toString();

    writeAll(contents)

    return readAll({
      headers: {
        'Range': util.format(
          // range is _inclusive_ so subtract one...
          'bytes=%d-', byteOffset(rangeStart)
        )
      }
    }).then(function(data) {
      assert.equal(data, expected);
    });
  });


  test('fetch one byte', function() {
    var rangeStart = 200;
    var rangeEnd = 333;

    var contents = range(0, 400);
    var expectedWrites = new Buffer(contents.join('\n'));

    var expected = expectedWrites.slice(
      byteOffset(rangeStart), byteOffset(rangeEnd + 1)
    ).toString();

    writeAll(contents)

    return readAll({
      headers: {
        // Per rfc 7233 Byte ranges are inclusive...
        'Range': 'bytes=0-0'
      }
    }).then(function(data) {
      assert.equal(data, '0');
    });
  });

  test('fetch in the middle', function() {
    var rangeStart = 200;
    var rangeEnd = 333;

    var contents = range(0, 400);
    var expectedWrites = new Buffer(contents.join('\n'));

    var expected = expectedWrites.slice(byteOffset(rangeStart), byteOffset(rangeEnd + 1)).toString();

    writeAll(contents)

    return readAll({
      headers: {
        'Range': util.format(
          // range is _inclusive_ so subtract one...
          'bytes=%d-%d', byteOffset(rangeStart), (byteOffset(rangeEnd + 1) - 1)
        )
      }
    }).then(function(data) {
      assert.equal(data, expected);
    });
  });



  test('end only', function() {
    var rangeStart = 0;
    var rangeEnd = 600;

    var contents = range(0, 2000);
    var expectedWrites = new Buffer(contents.join('\n'));

    var expected = expectedWrites.slice(
      byteOffset(rangeStart), byteOffset(rangeEnd + 1)
    ).toString();

    writeAll(contents)

    return readAll({
      headers: {
        'Range': util.format(
          // range is _inclusive_ so subtract one...
          'bytes=-%d', (byteOffset(rangeEnd + 1) - 1)
        )
      }
    }).then(function(data) {
      assert.equal(data, expected);
    });
  });

  teardown(function() {
    return handle.kill()
  });
});
