const Debug = require('debug');
const dockerUtils = require('dockerode-process/utils');
const parseImage = require('docker-image-parser');
const { scopeMatch } = require('taskcluster-base/utils');
const sleep = require('../util/sleep');

let debug = Debug('docker-worker:dockerImage');

// Prefix used in scope matching for authenticated docker images.
const IMAGE_SCOPE_PREFIX = 'docker-worker:image:';
//
// Settings for exponential backoff for retrying image pulls.
// Last attempt will be in a range between 6 and 10 minutes which is acceptable
// for an image pull.
const RETRY_CONFIG = {
  maxAttempts: 5,
  delayFactor: 15 * 1000,
  randomizationFactor: 0.25
};

class DockerImage {
  constructor(runtime, imageDetails, stream, task, scopes=[]) {
    this.runtime = runtime;
    this.imageName = imageDetails.name;
    this.stream = stream;
    this.scopes = scopes;
    this.task = task;

    var parsed = parseImage(this.imageName);
    this.name = parsed.repository;
    // Default to using the 'latest' tag if none specified to avoid pulling the
    // entire repository. Consistent with `docker run` defaults.
    this.tag = parsed.tag || 'latest';
    this.credentials = null;
  }

  async imageExists() {
    let imageDetails;
    try {
      let image = await this.runtime.docker.getImage(this.imageName);
      imageDetails = await image.inspect();
      this.imageId = imageDetails.Id;
    } catch(e) {
      imageDetails = false;
    }

    return imageDetails;
  }

  getImageName() {
    return this.imageName;
  }

  isAuthorized() {
    if (!this.canAuthenticate()) {
      return true;
    }

    // See if any credentials apply from our list of registries...
    let defaultRegistry = this.runtime.dockerConfig.defaultRegistry;
    this.credentials = this.getCredentials(this.runtime.registries, defaultRegistry);

    if (!this.credentials) {
      return true;
    }

    // Validate scopes on the image if we have credentials for it...
    let expectedScopes = [IMAGE_SCOPE_PREFIX + this.fullName];
    debug(`scopes: ${this.scopes} expected: ${expectedScopes}`);

    return scopeMatch(this.scopes, [expectedScopes]);
  }

  async download() {
    let dockerImageName = this.fullName;

    let pullOptions = {
      retryConfig: this.runtime.dockerConfig
    };

    if (this.canAuthenticate() && this.credentials) {
      // TODO: Ideally we would verify the authentication before allowing any
      // pulls (some pulls just check if the image is cached) the reason being
      // we have no way to invalidate images once they are on a machine aside
      // from blowing up the entire machine.
      pullOptions.authconfig = this.credentials;
    }

    let start = Date.now();
    let result = await this.pullImageStreamTo(this.runtime.docker,
      dockerImageName,
      this.stream,
      pullOptions);
    this.runtime.monitor.measure(
      'task.dockerImage.downloadTime',
      Date.now() - start
    );

    return result;
  }

  async pullImageStreamTo(docker, image, stream, options={}) {
    let config = options.retryConfig || RETRY_CONFIG;
    let attempts = 0;

    while (attempts++ < config.maxAttempts) {
      debug('pull image. Image: %s Attempts: %s', image, attempts);

      try {
        let downloadProgress =
          dockerUtils.pullImageIfMissing(docker, image, options);

        downloadProgress.pipe(stream, {end: false});
        await new Promise((accept, reject) => {
          downloadProgress.once('error', reject);
          downloadProgress.once('end', accept);
        });

        let pulledImage = await this.imageExists();

        if (!pulledImage) {
          throw new Error('image missing after pulling');
        }

        return pulledImage;
      } catch (err) {
        if (attempts >= config.maxAttempts) {
          throw new Error(err);
        }

        let delay = Math.pow(2, attempts - 1) * config.delayFactor;
        let randomizationFactor = config.randomizationFactor;
        delay = delay * (Math.random() * 2 * randomizationFactor + 1 - randomizationFactor);
        debug(
          'pull image failed Next Attempt in: %s ms. Image: %s. %s, as JSON: %j',
          delay.toFixed(2),
          image,
          err,
          err.stack
        );

        await sleep(delay);
      }
    }
  }

  /**
  Return full image path including tag.
  */
  get fullName() {
    return this.name + (this.tag ? ':' + this.tag : '');
  }

  /**
  Determine if we should attempt to authenticate against this image name... The
  image will not be considered something to authenticate against unless it has
  three parts: <host>/<user>/<image>. Note this does not mean you cannot
  authenticate against docker you just need to prefix the default path with:
  `registry.hub.docker.com`.

  @return {Boolean}
  */
  canAuthenticate() {
    var components = this.name.split('/').filter(function(part) {
      // strip empty parts...
      return !!part;
    });

    return components.length === 2 || components.length === 3;
  }

  /**
  Attempt to find credentials from within an object of repositories.

  @return {Object|null} credentials or null...
  */
  getCredentials(repositories, defaultRegistry='') {
    // We expect the image to be be checked via imageCanAuthenticate first.
    // This could be user/image or host/user/image.  If only user/image, use
    // default registry
    var parts = this.name.split('/');
    if (parts.length === 2) parts.unshift(defaultRegistry);

    var registryHost = parts[0];
    var registryUser = parts[1];
    var result;

    // Note this may search through all repositories intentionally as to only
    // match the correct (longest match based on slashes).
    for (var registry in repositories) {

      // Longest possible match always wins fast path return...
      if (registryHost + '/' + registryUser === registry) {
        return repositories[registry];
      }

      // Hold on to partial matches but we cannot use these as the final values
      // without exhausting all options...
      if (registryHost + '/' === registry || registryHost === registry) {
        result = repositories[registry];
      }
    }

    return result;
  }
}

module.exports = DockerImage;
