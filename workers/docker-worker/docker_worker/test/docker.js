var URL = require('url'),
    Docker = require('dockerode-promise'),
    dockerOpts = require('dockerode-options');

module.exports = function docker() {
  return new Docker(
    dockerOpts(process.env.DOCKER_PORT)
  );
};
