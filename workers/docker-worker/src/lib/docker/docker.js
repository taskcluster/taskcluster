const DockerAPI = require('dockerode-promise');
const dockerOpts = require('dockerode-options');

class Docker extends DockerAPI {
  constructor() {
    super(dockerOpts);
  }
}

module.exports = Docker;
