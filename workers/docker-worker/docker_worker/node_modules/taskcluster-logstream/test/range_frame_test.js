suite('range frame', function() {
  var Server = require('./server');
  var rangeFrame = require('./range_frame');
  var httpGet = require('./get');


  var server;
  var subject;
  var url;
  setup(function(done) {
    server = new Server();
    subject = server.pushFrame(rangeFrame()).state;

    server.listen(function(err) {
      url = server.url();
      done(err);
    });
  });

  function getRange(start, etag) {
    var URL = require('url');

    // parsed out server url
    var options = URL.parse(url);

    options.method = 'GET';
    options.headers = {
      'Range': 'bytes=' + start + '-'
    };

    if (etag) {
      options.headers['If-None-Match'] = etag;
    }

    return httpGet(options);
  }

  suite('fetching blocks from frame', function() {

    test('without any content', function() {
      return httpGet(url).then(
        function missingBlock(res) {
          assert.equal(res.statusCode, 404);
        }
      );
    });

    test('the entire block', function() {
      var expected = new Buffer('xfoo');
      subject.end(expected);

      return httpGet(url).then(
        function singleBlock(res) {
          var headers = res.headers;
          assert.equal(headers['content-length'], expected.length);
          assert.equal(res.statusCode, 200);
          assert.equal(res.text, expected.toString());
        }
      );
    });

    test('incremental writes', function(done) {
      var buffers = [
        new Buffer('i am a little stringy\n'),
        new Buffer('but not too much\n'),
        new Buffer('right?')
      ];

      var expected = Buffer.concat(buffers).toString();

      // write out the first buffer
      subject.write(buffers[0]);

      function validateChunk(res, idx) {
        var buffer = buffers[idx];
        assert.equal(res.headers['content-length'], buffer.length);
        assert.equal(res.text, buffer.toString());

        return parseInt(res.headers['content-length']);
      }

      var offset = 0;

      return getRange(offset).then(
        function firstWrite(res) {
          subject.write(buffers[1]);
          return getRange(offset += validateChunk(res, 0));
        }
      ).then(
        function secondWrite(res) {
          subject.write(buffers[2]);
          return getRange(offset += validateChunk(res, 1));
        }
      ).then(
        function finalRead(res) {
          validateChunk(res, 2);
        }
      );
    });

    test('etag writes', function() {
      subject.end(new Buffer('xfoo'));

      return httpGet(url).then(
        function initialGrab(res) {
          var headers = res.headers;
          assert.ok(headers.etag);

          return getRange(0, headers.etag);
        }
      ).then(
        function withEtag(res) {
          // 304 indicates nothing has changed.
          assert.equal(res.statusCode, 304);
          assert.ok(!res.headers['content-length']);
          assert.ok(!res.headers[subject.FINAL_HEADER]);
        }
      );
    });

    test('complete objects', function() {
      var buffer = new Buffer('xfoo');
      subject.end(buffer);

      return httpGet(url).then(
        function finalGrab(res) {
          var headers = res.headers;
          assert.ok(headers[subject.FINAL_HEADER], 'has final header');
        }
      );
    });

    test('invalid range', function() {
      subject.end(new Buffer('xxx'));
      return getRange(1000).then(
        function(res) {
          assert.equal(res.statusCode, 416);
          assert.ok(
            !res.headers[subject.FINAL_HEADER],
            'invalid range does not include final header'
          );
        }
      );
    });
  });

});
