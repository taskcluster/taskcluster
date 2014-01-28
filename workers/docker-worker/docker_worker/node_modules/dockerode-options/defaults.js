var parse = require('./parse');

// default docker path on linux
var DEFAULT_SOCKET_PATH = '/var/run/docker.sock';

/**
Attempts to find reasonable defaults when connecting to a docker host if none
are given.

@param {Object|String|Null} options for dockerode.
@return {Object} docker options.
*/
function defaults(options) {
  // if there are options given just return those
  if (options) return parse(options);

  // DOCKER_HOST is used generally when there is a remote host (like on OSX)
  if (process.env.DOCKER_HOST) {
    return parse(process.env.DOCKER_HOST);
  }

  // finally the socket path is the default (linux)
  return { socketPath: DEFAULT_SOCKET_PATH };
}

module.exports = defaults;
