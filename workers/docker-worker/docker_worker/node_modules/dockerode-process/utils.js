var Promise = require('promise');
var stream = require('stream');
var debug = require('debug')('docker-process:utils');

function PullStatusStream() {
  stream.Transform.apply(this, arguments);
}

PullStatusStream.prototype = {
  __proto__: stream.Transform.prototype,

  _transform: function(buffer, encoding, done) {
    var json = JSON.parse(buffer.toString());

    // build a nice string that we can show in the logs
    if (json.error) {
      this.push(json.error + '\n');
      this.emit('error', new Error(json.error));
      return done();
    }

    if (json.id) {
      var str = json.id + ' - ' + json.status;
      if (json.progress) str += ' ' + json.progress;
      str += '\n';
      this.push(str);
      return done();
    }

    this.push(json.status + '\n');
    done();
  }
};

function removeImageIfExists(docker, image) {
  debug('remove', image);
  return new Promise(function(accept, reject) {
    // delete the image but ignore 404 errors
    docker.getImage(image).remove().then(
      function removed(list) {
        debug('removed', image, list);
        accept();
      },
      function removeError(err) {
        // XXX: https://github.com/apocas/docker-modem/issues/9
        if (err.message.indexOf('404') !== -1) return accept();
        reject(err);
      }
    );
  });
}

module.exports.removeImageIfExists = removeImageIfExists;


/**
Returns a promise for the result of the image pull (no output stream).

@return Promise
*/
function pullImage(docker, image) {
  return new Promise(function(accept, reject) {
    docker.pull(image).then(
      function(stream) {
        var pullStatusStream = new PullStatusStream();
        stream.pipe(pullStatusStream);

        pullStatusStream.on('data', function(value) {
          debug('pull image', value.toString());
        });

        pullStatusStream.once('error', reject);
        pullStatusStream.once('end', accept);
      },
      reject
    );
  });
}

module.exports.pullImage = pullImage;

/**
Returns a stream suitable for stdout for the download progress (or the cache).
@return {Stream}
*/
function streamImage(docker, image) {
  debug('ensure image', image);
  var pullStream = new PullStatusStream();

  // first attempt to find the image locally...
  docker.getImage(image).inspect().then(
    function inspection(gotImg) {
      // push a value directly to the result without the transform.
      pullStream.push(image + ' exists in the cache.\n');
      // end the stream.
      pullStream.end();
    },

    function missingImage() {
      debug('image is missing pull', image);
      // image is missing so pull it
      docker.pull(image).then(function(rawPullStream) {
        rawPullStream.pipe(pullStream);
      });
    }
  ).then(
    null,
    function handleErrors(err) {
      pullStream.emit('error', err);
    }
  );

  return pullStream;
}

module.exports.streamImage = streamImage;
