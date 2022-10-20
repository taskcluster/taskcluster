const appRootDir = require('app-root-dir');
const {
  dockerPull,
  dockerImages,
  dockerRegistryCheck,
  ensureTask,
  dockerPush,
  execCommand,
} = require('../../utils');
const path = require('path');

/**
 * This builds generic worker docker image containing all tools required to run generic worker
 */
module.exports = ({ tasks, baseDir, cmdOptions, credentials, logsDir }) => {
  const sourceDir = appRootDir.get();

  ensureTask(tasks, {
    title: 'Build Generic Worker Docker Image',
    requires: [
      'release-version',
      'docker-flow-version',
    ],
    provides: [
      'generic-worker-docker-image', // image tag
      'generic-worker-image-on-registry', // true if the image is already on registry
    ],
    locks: ['git'],
    run: async (requirements, utils) => {
      let dockerRepoGenericWorker = cmdOptions.dockerRepoGenericWorker;
      if (!dockerRepoGenericWorker) {
        if (cmdOptions.push) {
          throw new Error('--docker-repo must be given with --push');
        }
        // if not pushing, just name the image `generic-worker:vX.Y.Z`.
        dockerRepoGenericWorker = 'taskcluster/generic-worker';
      }
      const tag = `${dockerRepoGenericWorker}:v${requirements['release-version']}`;

      utils.step({ title: 'Check for Existing Images' });

      const imageLocal = (await dockerImages({ baseDir }))
        .some(image => image.RepoTags && image.RepoTags.indexOf(tag) !== -1);

      let imageOnRegistry;
      try {
        imageOnRegistry = await dockerRegistryCheck({ tag });
        utils.status({ message: `Image does ${imageOnRegistry ? '' : 'not '} exist on registry` });
      } catch (err) {
        utils.status({ message: `Error fetching image on registry: ${err.message}` });
      }

      const provides = {
        'generic-worker-docker-image': tag,
        'generic-worker-image-on-registry': imageOnRegistry,
      };

      if (imageOnRegistry && !cmdOptions.cache) {
        throw new Error(
          `Image ${tag} already exists on the registry, but --no-cache was given.`);
      }

      // bail out if we can, pulling the image if it's only available remotely
      if (!imageLocal && imageOnRegistry) {
        await dockerPull({ image: tag, utils, baseDir });
        return utils.skip({ provides });
      } else if (imageLocal) {
        return utils.skip({ provides });
      }

      utils.step({ title: `Building Docker Image ${tag}` });

      let versionJson = requirements['docker-flow-version'];
      let command = [
        'docker',
        'build',
      ];
      if (!cmdOptions.cache) {
        command.push('--no-cache');
      }
      command = command.concat([
        '-f', 'generic-worker.Dockerfile',
        '--progress', 'plain',
        '--tag', tag,
        '--build-arg', 'DOCKER_FLOW_VERSION=' + versionJson,
        '.']);
      await execCommand({
        command,
        dir: sourceDir,
        logfile: path.join(logsDir, 'docker-build.log'),
        utils,
        env: { DOCKER_BUILDKIT: 1, ...process.env },
      });

      return provides;
    },
  });

  ensureTask(tasks, {
    title: `Generic Worker Docker Image' - Push Image`,
    requires: [
      `generic-worker-docker-image`,
      `generic-worker-image-on-registry`,
    ],
    provides: [
      `generic-worker-push`,
    ],
    run: async (requirements, utils) => {
      const tag = requirements[`generic-worker-docker-image`];
      const provides = { [`generic-worker-push`]: tag };

      if (!cmdOptions.push) {
        return utils.skip({ provides });
      }

      if (requirements[`generic-worker-image-on-registry`]) {
        return utils.skip({ provides });
      }

      const dockerPushOptions = {};
      if (credentials.dockerUsername && credentials.dockerPassword) {
        dockerPushOptions.credentials = {
          username: credentials.dockerUsername,
          password: credentials.dockerPassword,
        };
      }

      await dockerPush({
        logfile: path.join(logsDir, 'docker-push.log'),
        tag,
        utils,
        baseDir,
        ...dockerPushOptions,
      });

      return provides;
    },
  });

  ensureTask(tasks, {
    title: `Generic worker image - Complete`,
    requires: [
      `generic-worker-push`,
    ],
    provides: [
      `generic-worker-image`,
    ],
    run: async (requirements, utils) => {
      return {
        'generic-worker-image': `Generic worker docker image: ${requirements['generic-worker-push']}`,
      };
    },
  });
};
