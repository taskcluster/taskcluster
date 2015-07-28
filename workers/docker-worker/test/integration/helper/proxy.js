var devnull = require('dev-null');
var docker = require('../../../lib/docker')();
var dockerUtils = require('dockerode-process/utils');
var waitForEvent = require('../../../lib/wait_for_event');

// Registry proxy image...
var DOCKER_IMAGE = 'lightsofapollo/docker-registry-proxy';

module.exports = function* (credentials) {
  var stream = dockerUtils.pullImageIfMissing(docker, DOCKER_IMAGE);
  // Ensure the test proxy actually exists...
  stream.pipe(devnull());
  yield waitForEvent(stream, 'end');

  var createContainer = {
    Hostname: '',
    User: '',
    AttachStdin: false,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    OpenStdin: false,
    StdinOnce: false,
    Env: null,
    Image: DOCKER_IMAGE,
    Cmd: [credentials.username, credentials.password],
    Volumes: {},
    VolumesFrom: []
  };

  var container = yield docker.createContainer(createContainer);
  container = docker.getContainer(container.id);

  var start = yield container.start({
    PublishAllPorts: true
  });

  var portConfig = (yield docker.listContainers()).filter(function(item) {
    return item.Id === container.id;
  })[0];

  if (!portConfig) {
    throw new Error('Could not find port configuration');
  }

  // XXX: This is a probable hack as localhost is only true if we run the docker
  // worker in a docker container on the target system... This is a big
  // assumption that happens to be true in the tests at least.
  var domain = 'localhost:' + portConfig.Ports[0].PublicPort;

  // Public api to interface with registry proxy...
  return {
    url: 'http://' + domain + '/',
    imageName: function(name) {
      return domain + '/' + name;
    },
    close: function* () {
      yield container.stop();
      yield container.kill();
    }
  };
};
