suite('http streams stream', function() {
  var HttpStreams = require('./http_streams_stream');

  // test utilities
  var Server = require('./test/server');
  var rangeFrame = require('./test/range_frame');

  var server;
  var writer;
  var url;
  setup(function(done) {
    server = new Server();
    writer = server.pushFrame(rangeFrame()).state;

    server.listen(function(err) {
      if (err) return done(err);
      url = server.url();
      done();
    });
  });

  var subject;
  setup(function() {
    subject = new HttpStreams(url, {
      intervalMS: 10
    });
  });

  function writeFromBufferList(list) {
    var item = list.shift();
    if (!item) {
      writer.end();
      return null;
    }

    writer.write(item);
    return item;
  }

  function joinStreams(streams, callback) {
    var buffers = [];

    function readStream() {
      var stream = streams.shift();
      if (!stream) {
        return callback(null, Buffer.concat(buffers));
      }

      stream.on('data', function(buffer) {
        buffers.push(buffer);
      });

      stream.once('end', readStream);
    }

    readStream();
  }

  test('with custom headers', function(done) {
    subject = new HttpStreams(url, {
      headers: { 'x-custom': true }
    });

    server.unshiftFrame(function(req, res) {
      res.writeHead(200);
      res.end();
      assert.ok(req.headers['x-custom']);
      done();
    });

    // initiate the read...
    subject.once('readable', function() {
      subject.read();
    });
  });

  suite('read until end', function() {
    var buffers;
    setup(function() {
      buffers = [
        new Buffer('one'),
        new Buffer('two'),
        new Buffer('three')
      ];
    });

    test('requests with retries', function(done) {
      var streams = [];
      var expected = Buffer.concat(buffers).toString();
      setTimeout(writeFromBufferList, 10, buffers);

      subject.once('end', function() {
        joinStreams(streams, function(err, buffer) {
          assert.equal(buffer.toString(), expected);
          done();
        });
      });

      subject.on('readable', function() {
        var count = 0;
        var item;

        while (item = subject.read()) {
          count++;
          if (count > 1) return done(new Error('multiple streams emitted'));
          setTimeout(writeFromBufferList, 15, buffers);
          streams.push(item);
        }
      });
    });
  });
});

