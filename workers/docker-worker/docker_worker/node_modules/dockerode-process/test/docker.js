var dockerOpts = require('dockerode-options'),
    Docker = require('dockerode-promise');

module.exports = function docker(options) {
  return new Docker(dockerOpts());
};
