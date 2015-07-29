import DockerImage from './docker_image';
import dockerUtils from 'dockerode-process/utils';
import Debug from 'debug';
import { scopeMatch } from 'taskcluster-base/utils';
import waitForEvent from './wait_for_event';
import sleep from './util/sleep';

let debug = Debug('pull_image');

// Prefix used in scope matching for authenticated docker images.
const IMAGE_SCOPE_PREFIX = 'docker-worker:image:';

// This string was super long but I wanted to say all these thing so I broke it
// out into a constant even though most errors are closer to their code...
export const IMAGE_ERROR = 'Error: Pulling docker image "%s" has failed this may indicate an ' +
                  'Error with the registry used or an authentication error ' +
                  'in the worker try pulling the image locally. %s';

// Settings for exponential backoff for retrying image pulls.
// Last attempt will be in a range between 6 and 10 minutes which is acceptable
// for an image pull.
const RETRY_CONFIG = {
  maxAttempts: 5,
  delayFactor: 15 * 1000,
  randomizationFactor: 0.25
}

export async function pullImageStreamTo(docker, image, stream, options={}) {
  let config = options.retryConfig || RETRY_CONFIG;
  let attempts = 0;

  while (attempts++ < config.maxAttempts) {
    debug('pull image. Image: %s Attempts: %s', image, attempts);
    let downloadProgress =
      dockerUtils.pullImageIfMissing(docker, image, options);

    downloadProgress.pipe(stream, {end: false});

    try {
      await new Promise((accept, reject) => {
        downloadProgress.once('error', reject);
        downloadProgress.once('end', accept);
      });

      // Ensure image downloaded after pulling. This is mostly for multiple tasks
      // pulling at the same time, only one will pull the image while the others wait.
      // Even if the pull failed by the client that was pulling, the stream ends without
      // error for the other clients because they are done waiting.
      let pulledImage = await docker.getImage(image);
      pulledImage = await pulledImage.inspect();

      if (!pulledImage) {
        throw new Error('image missing after pulling');
      }

      return;
    } catch (err) {
      if (attempts >= config.maxAttempts) {
        throw new Error(err);
      }

      let delay = Math.pow(2, attempts - 1) * config.delayFactor;
      let randomizationFactor = config.randomizationFactor;
      delay = delay * (Math.random() * 2 * randomizationFactor + 1 - randomizationFactor);
      debug(
        'pull image failed Next Attempt in: %s ms. Image: %s. %s, as JSON: %j',
        delay,
        image,
        err,
        err.stack
      );

      await sleep(delay);
    }
  }
}

export async function pullDockerImage(runtime, imageName, scopes, taskId, runId, stream) {
  let dockerImage = new DockerImage(imageName);
  let dockerImageName = dockerImage.fullPath();

  runtime.log('pull image', {
    taskId: taskId,
    runId: runId,
    image: dockerImageName
  });

  let pullOptions = {
    retryConfig: runtime.dockerConfig
  };

  if (dockerImage.canAuthenticate()) {
    // See if any credentials apply from our list of registries...
    let defaultRegistry = runtime.dockerConfig.defaultRegistry;
    let credentials = dockerImage.credentials(runtime.registries, defaultRegistry);
    if (credentials) {
      // Validate scopes on the image if we have credentials for it...
      if (!scopeMatch(scopes, [[IMAGE_SCOPE_PREFIX + dockerImageName]])) {
        throw new Error(
          'Insufficient scopes to pull : "' + dockerImageName + '" try adding ' +
          IMAGE_SCOPE_PREFIX + dockerImageName + ' to the .scopes array.'
        );
      }

      // TODO: Ideally we would verify the authentication before allowing any
      // pulls (some pulls just check if the image is cached) the reason being
      // we have no way to invalidate images once they are on a machine aside
      // from blowing up the entire machine.
      pullOptions.authconfig = credentials;
    }
  }

  return await pullImageStreamTo(
    runtime.docker, dockerImageName, stream, pullOptions
  );
}
