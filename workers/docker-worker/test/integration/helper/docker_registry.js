const devnull = require('dev-null');
const dockerUtils = require('dockerode-process/utils');
const path = require('path');
const slugid = require('slugid');

const sleep = require('../../../src/lib/util/sleep');
const {removeImage} = require('../../../src/lib/util/remove_image');
const pipe = require('promisepipe');

// Registry proxy image...
const DOCKER_IMAGE = 'registry:2';

class Registry {
  constructor(docker) {
    this.docker = docker;
  }

  async start() {
    var stream = dockerUtils.pullImageIfMissing(this.docker, DOCKER_IMAGE);
    // Ensure the test proxy actually exists...
    await pipe(stream, devnull());

    await this.createContainer();
    await this.startContainer();
  }

  async createContainer() {
    let baseDir = path.join(__dirname, '..', '..', 'fixtures');
    let createContainer = {
      AttachStdin: false,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      OpenStdin: false,
      StdinOnce: false,
      Env: [
        'REGISTRY_HTTP_TLS_CERTIFICATE=/fixtures/ssl_cert.crt',
        'REGISTRY_HTTP_TLS_KEY=/fixtures/ssl_cert.key',
        'REGISTRY_AUTH=htpasswd',
        'REGISTRY_AUTH_HTPASSWD_REALM=Registry Realm',
        'REGISTRY_AUTH_HTPASSWD_PATH=/fixtures/auth/htpasswd',
        'REGISTRY_HTTP_SECRET=' + slugid.nice()
      ],
      Image: DOCKER_IMAGE,
      Cmd: [],
      ExposedPorts: {
        '5000/tcp': {}
      },
      Volumes: {},
      VolumesFrom: [],
      HostConfig: {
        Binds: [
          `${baseDir}:/fixtures`
        ],
        PortBindings: {
          '5000/tcp': [{Hostport: '0'}]
        }
      }
    };

    var container = await this.docker.createContainer(createContainer);
    this.containerId = container.id;
    this.container = this.docker.getContainer(container.id);
  }

  async removeContainer() {
    try {
      console.log('removing container');
      await this.container.stop();
      await this.container.remove();
      console.log('container removed');
    } catch(e) {
      console.log('Could not stop registry container. ', e.message);
    }

    this.container = undefined;
  }

  async startContainer() {
    await this.container.start({});

    let portConfig = (await this.docker.listContainers()).filter((item) => {
      return item.Id === this.containerId;
    })[0];

    if (!portConfig) {
      throw new Error('Could not find port configuration');
    }

    // XXX: This is a probable hack as localhost is only true if we run the docker
    // worker in a docker container on the target system... This is a big
    // assumption that happens to be true in the tests at least.
    this.domain = 'localhost:' + portConfig.Ports[0].PublicPort;
    // Wait for the registry to be fully initialized before continuing.  This is
    // just some guesswork as to how long until there is a more reliable way
    // of telling
    await sleep(10000);
  }

  imageName(name) {
    return this.domain + '/' + name;
  }

  async close() {
    await this.container.kill();
  }

  async loadImageWithTag(imageName, credentials) {
    let docker = this.docker;
    var stream = dockerUtils.pullImageIfMissing(docker, imageName);
    // Ensure the test proxy actually exists...
    await pipe(stream, devnull());

    let image = await docker.getImage(imageName);

    let newImageName = `${this.domain}/${credentials.username}/${imageName.split(':')[0]}`;
    let tag = imageName.split(':')[1];
    await image.tag({
      repo: newImageName,
      tag: tag,
      force: true
    });

    let newImage = await docker.getImage(newImageName);

    await newImage.push({
      authconfig: {
        username: credentials.username,
        password: credentials.password,
        email: 'test@test.com',
        serveraddress: 'https://' + this.domain
      }
    });

    // Some reason the push event returns right away even though push hasn't completed
    // yet.  This is a safeguard (read: hack)
    await sleep(20000);

    await removeImage(docker, newImageName);
    await removeImage(docker, imageName);

    return newImageName + ':' + tag;
  }
}

module.exports = Registry;
