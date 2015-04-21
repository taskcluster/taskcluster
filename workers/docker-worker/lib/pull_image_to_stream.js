import DockerImage from './docker_image';
import dockerUtils from 'dockerode-process/utils';
import Debug from 'debug';
import { scopeMatch } from 'taskcluster-base/utils';

let debug = Debug('pull_image');

// Prefix used in scope matching for authenticated docker images.
const IMAGE_SCOPE_PREFIX = 'docker-worker:image:';

// This string was super long but I wanted to say all these thing so I broke it
// out into a constant even though most errors are closer to their code...
export const IMAGE_ERROR = 'Pulling docker image "%s" has failed this may indicate an ' +
                  'Error with the registry used or an authentication error ' +
                  'in the worker try pulling the image locally. \n Error %s';


export function pullImageStreamTo(docker, image, stream, options) {
  return new Promise(function(accept, reject) {
    debug('pull image', image);
    var downloadProgress =
      dockerUtils.pullImageIfMissing(docker, image, options);

    downloadProgress.pipe(stream, { end: false });
    downloadProgress.once('error', reject);
    downloadProgress.once('end', accept);
  });
}

export async function pullDockerImage(runtime, imageName, scopes, taskId, runId, stream) {
  let dockerImage = new DockerImage(imageName);
  let dockerImageName = dockerImage.fullPath();

  runtime.log('pull image', {
    taskId: taskId,
    runId: runId,
    image: dockerImageName
  });

  // There are cases where we cannot authenticate a docker image based on how
  // the name is formatted (such as `registry`) so simply pull here and do
  // not check for credentials.
  if (!dockerImage.canAuthenticate()) {
    return await pullImageStreamTo(
      runtime.docker, dockerImageName, stream
    );
  }

  let pullOptions = {};
  // See if any credentials apply from our list of registries...
  let credentials = dockerImage.credentials(runtime.registries);
  if (credentials) {
    // Validate scopes on the image if we have credentials for it...
    if (!scopeMatch(scopes, IMAGE_SCOPE_PREFIX + dockerImageName)) {
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

  return await pullImageStreamTo(
    runtime.docker, dockerImageName, stream, pullOptions
  );
}
