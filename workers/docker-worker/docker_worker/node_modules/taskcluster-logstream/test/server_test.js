suite('server', function() {
  var Server = require('./server');
  var Promise = require('promise');

  var http = require('http');
  var httpGet = require('./get');

  var subject;
  var url;
  setup(function(done) {
    subject = new Server();
    subject.listen(function(err) {
      url = subject.url();
      done(err);
    });
  });

  test('#url', function() {
    assert.ok(url, 'returns a url');
    assert.ok(url.indexOf(subject.address().port) !== -1, 'has port');
  });

  suite('#(unshift|push)Frame', function() {
    function status(status) {
      return function(req, res, done) {
        res.writeHead(status);
        res.end();
        done();
      }
    }

    suite('one shot frame', function() {
      setup(function() {
        // use two "one shot" frames to ensure they can yield to one another.
        subject.pushFrame(status(404));
        subject.pushFrame(status(500));
      });

      test('multiple frames', function() {
        return httpGet(url).then(
          // first request
          function(res) {
            assert.equal(res.statusCode, 404);
            assert.equal(subject.frames.length, 1);

            // second http request
            return httpGet(url);
          }
        ).then(
          function(res) {
            assert.equal(res.statusCode, 500);
            assert.equal(subject.frames.length, 0);
          }
        );
      });
    });

    suite('layered frame', function() {
      setup(function() {
        var thrownError = false;

        subject.pushFrame(function(req, res, finishPush) {
          // success
          res.writeHead(200);
          res.end();

          if (thrownError) return finishPush();

          // but next is a failure
          subject.unshiftFrame(function(req, res, finishUnshift) {
            thrownError = true;
            res.writeHead(500);
            res.end();
            finishUnshift();
          });
        });
      });

      test('three frames that bounce between one another', function() {
        return httpGet(url).then(
          function firstFrame(res) {
            assert.equal(res.statusCode, 200);
            return httpGet(url);
          }
        ).then(
          function secondFrame(res) {
            assert.equal(res.statusCode, 500);
            return httpGet(url);
          }
        ).then(
          function thirdFrame(res) {
            assert.equal(res.statusCode, 200);
            assert.equal(subject.frames.length, 0);
          }
        );
      });
    });
  });
});
