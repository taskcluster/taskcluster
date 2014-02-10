suite('reader', function() {
  var reader = require('./');

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
    subject = reader(url, {
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

  suite('read until end', function() {

    var buffers;
    setup(function() {
      buffers = [
        new Buffer('one'),
        new Buffer('two'),
        new Buffer('three')
      ];
    });

    // this works because each request will emit more data... in the real world
    // we also have cases where there is not any new data so we need to poll for
    // new data.
    test('each request yields data', function(done) {
      var output = [];
      var expected = Buffer.concat(buffers);

      subject.once('end', function() {
        assert.equal(
          Buffer.concat(output).toString(),
          expected.toString()
        );

        done();
      });

      // (calling on data resumes the stream)
      subject.on('data', function(buffer) {
        output.push(buffer);
        writeFromBufferList(buffers);
      });

      writeFromBufferList(buffers);
    });

    test('requests that require polling', function(done) {

      var content = new Buffer(0);
      var expected = Buffer.concat(buffers).toString();

      subject.once('end', function() {
        assert.equal(
          expected,
          content.toString()
        );
        done();
      });

      subject.on('data', function(buffer) {
        content = Buffer.concat([content, buffer]);
      });

      // spew data into the server every once and awhile...
      function pushContent() {
        var hasContent = writeFromBufferList(buffers);
        if (hasContent) setTimeout(pushContent, 20);
      }

      setTimeout(pushContent, 15);
    });
  });
});
