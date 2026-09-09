import path from 'node:path';
import taskcluster from '@taskcluster/client';
import { REPO_ROOT } from './repo.js';
import got from 'got';
import { execCommand, execCommandOutput } from './command.js';
import mkdirp from 'mkdirp';
import { rimraf } from 'rimraf';

/**
 * Pull an image from a docker registry (`docker pull`)
 *
 * - image -- image to pull
 * - utils -- taskgraph utils (waitFor, etc.)
 */
export const dockerPull = async ({ image, utils }) => {
  utils.status({ message: `docker pull ${image}` });
  await execCommand({ command: ['docker', 'pull', image], utils });
};

/**
 * Check whether an image is present locally (`docker image inspect`)
 *
 * - tag -- the tag to check for
 */
export const dockerImageExists = async ({ tag }) => {
  try {
    await execCommandOutput({ command: ['docker', 'image', 'inspect', tag] });
    return true;
  } catch (err) {
    if (err.exitCode === undefined) {
      throw err;
    }
    return false;
  }
};

/**
 * Check whether a tag exists on a registry
 *
 * - tag -- the tag to check for
 */
export const dockerRegistryCheck = async ({ tag }) => {
  const [repo, imagetag] = tag.split(/:/);

  try {
    // Access the registry API directly to see if this tag already exists, and do not push if so.
    const res = await got(`https://hub.docker.com/v2/repositories/taskcluster/${repo}/tags`, { responseType: 'json' });
    if (!res.body) {
      throw new Error('invalid response from hub.docker.com');
    }
    if (res.body.map(l => l.name).includes(imagetag)) {
      return true;
    }
  } catch (err) {
    if (err.response.statusCode !== 404) {
      throw err;
    }
  }

  return false;
};

/**
 * Push an image to a registry (`docker push`)
 *
 * - baseDir -- base directory for operations
 * - tag -- tag to push
 * - logfile -- name of the file to write the log to
 * - credentials -- {username, secret} for docker access
 *     (optional; uses existing docker creds if omitted)
 * - utils -- taskgraph utils (waitFor, etc.)
 */
export const dockerPush = async ({ baseDir, tag, logfile, credentials, utils }) => {
  let homeDir;
  const env = { ...process.env };

  /**
   * exponential backoff with the following delays
   * for the first 5 retries:
   * [1ms,10ms,100ms,1s,10s]
   */
  const delay = retryCount => new Promise(resolve => setTimeout(resolve, 10 ** retryCount));

  const execDockerPush = async (maxRetries, retryCount = 0, lastError = null) => {
    if (retryCount > maxRetries) {
      throw new Error(lastError);
    }

    try {
      return await execCommand({
        dir: baseDir,
        command: ['docker', 'push', tag],
        utils,
        logfile,
        env,
      });
    } catch (err) {
      await delay(retryCount);
      return execDockerPush(maxRetries, retryCount + 1, err);
    }
  };

  try {
    if (credentials) {
      // override HOME so this doesn't use the user's credentials
      homeDir = path.join(REPO_ROOT, 'temp', taskcluster.slugid());
      await mkdirp(homeDir);
      env.HOME = homeDir;

      // run `docker login` to set up credentials in the temp homedir
      utils.status({ message: `Signing into docker hub with username ${credentials.username}` });
      await execCommand({
        dir: baseDir,
        command: ['docker', 'login', '--username', credentials.username, '--password-stdin'],
        utils,
        stdin: credentials.password,
        logfile,
        env,
      });
    }

    await execDockerPush(5);
  } finally {
    if (homeDir) {
      await rimraf(homeDir);
    }
  }
};
