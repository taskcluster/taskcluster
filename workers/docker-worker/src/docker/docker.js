const DockerAPI = require('dockerode');
const dockerOpts = require('dockerode-options');

class Docker extends DockerAPI {
  constructor() {
    super(dockerOpts);
  }
}

module.exports = Docker;
