suite('stream', function() {
  var azure = require('azure');
  var service = azure.createBlobService();
  var https = require('https');
  var fs = require('fs');
  var uuid = require('uuid');

  var BlockStream = require('./block_stream');
  var Promise = require('promise');

  if (process.env.DEBUG) {
    service.logger = new azure.Logger(azure.Logger.LogLevels.DEBUG);
  }

  /**
  Use the node http client to fetch the entire contents of the azure upload.
  */
  function fetchContents() {
    var promise = new Promise(function(accept, reject) {
      var url = service.getBlobUrl(container, path);
      var buffer = new Buffer(0);
      var req = https.get(url, function(res) {
        res.on('data', function(incoming) {
          buffer = Buffer.concat([buffer, incoming]);
        });

        res.on('end', function() {
          accept({
            content: buffer,
            headers: res.headers
          });
        });
      }).once('error', reject);
    });

    return promise;
  }

  var subject;
  var path = 'mycommitfile.txt';
  var container;
  setup(function() {
    container = uuid.v4();
    subject = new BlockStream(service, container, path);
  });

  // create the container on azure
  setup(function(done) {
    service.createContainerIfNotExists(
      container,
      // allow any public GET operations
      { publicAccessLevel: 'container' },
      done
    );
  });

  // ensure we are always in a clean state
  teardown(function(done) {
    service.deleteContainer(container, done);
  });

  var fixture = __dirname + '/test/fixtures/travis_log.txt';
  var subject;
  setup(function() {
    subject = new BlockStream(
      service,
      container,
      path
    );
  });

  suite('partial upload', function() {
    var expectedContent = new Buffer('xxx');
    setup(function(done) {
      subject.write(expectedContent, null, done);
    });

    test('content should be written but not marked as finished', function() {
      return fetchContents().then(
        function(result) {
          var headers = result.headers;
          var content = result.content.toString();

          // content is valid
          assert.equal(expectedContent.toString(), content);

          assert.ok(
            !headers[BlockStream.COMPLETE_HEADER],
            'is not marked as complete'
          );
        }
      );
    });
  });

  suite('upload an entire file', function() {
    // setup the stream
    setup(function(done) {
      fs.createReadStream(fixture).pipe(subject);
      assert.ok(!subject.closed, 'not closed');
      subject.once('close', function() {
        assert.ok(subject.closed, 'closed');
        done();
      });
      subject.once('error', done);
    });

    test('read contents', function() {
      var expected = fs.readFileSync(fixture);
      return fetchContents().then(
        function(result) {
          var headers = result.headers;
          var content = result.content.toString();

          // content is valid
          assert.equal(expected.toString(), content);

          assert.ok(
            headers[BlockStream.COMPLETE_HEADER],
            'is marked as complete'
          );

          assert.equal(
            headers['content-type'],
            subject.contentType
          );

          assert.equal(
            headers['content-encoding'],
            subject.contentEncoding
          );
        }
      );
    });
  });
});

