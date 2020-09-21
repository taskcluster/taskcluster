let Docker = require('dockerode');
let dockerOpts = require('dockerode-options');

/**
Tiny wrapper around creating a docker instance.

@return {Dockerrode}
*/
module.exports = function docker() {
  return new Docker(dockerOpts());
};
