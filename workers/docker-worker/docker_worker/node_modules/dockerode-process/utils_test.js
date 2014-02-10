suite('docker_utils', function() {
  var Promise = require('promise');
  var docker = require('./test/docker')();
  var subject = require('./utils');

  suite('#streamImage', function() {
    // image with a specific tag
    var image = 'lightsofapollo/test-taskenv:pass';
    setup(function() {
      return subject.removeImageIfExists(docker, image);
    });

    test('when image exists', function(done) {
      subject.pullImage(docker, image).then(
        function onStream() {
          var stream = subject.streamImage(docker, image);
          stream.resume();

          stream.once('data', function(value) {
            assert.ok(value.toString().indexOf(image) !== -1);
          });

          stream.once('error', done);
          stream.once('end', done);
        }
      );
    });

    test('when image does not exist', function(done) {
      var stream = subject.streamImage(docker, image);
      stream.resume();
      stream.once('end', function() {
        docker.getImage(image).inspect().then(
          function image(result) {
            assert.ok(result);
            done();
          },
          done
        );
      });
    });

  });
});
