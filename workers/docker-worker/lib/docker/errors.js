// This string was super long but I wanted to say all these thing so I broke it
// out into a constant even though most errors are closer to their code...
// TODO error message is specific to docker registry (what abaout indexed artifact?)
export const IMAGE_ERROR = 'Pulling docker image %s has failed. This may indicate an ' +
                  'error with the registry, image name, or an authentication error. ' +
                  'Try pulling the image locally to ensure image exists. %s';

