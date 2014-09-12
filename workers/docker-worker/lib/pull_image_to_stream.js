var dockerUtils = require('dockerode-process/utils');
var debug = require('debug')('pull_image');

module.exports = function pullImageStreamTo(docker, image, stream, options) {
  return new Promise(function(accept, reject) {
    debug('pull image', image);
    var downloadProgress =
      dockerUtils.pullImageIfMissing(docker, image, options);

    downloadProgress.pipe(stream, { end: false });
    downloadProgress.once('error', reject);
    downloadProgress.once('end', accept);
  });
}
