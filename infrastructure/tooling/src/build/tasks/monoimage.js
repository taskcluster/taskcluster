import appRootDir from 'app-root-dir';

import {
  dockerPull,
  dockerImages,
  dockerRegistryCheck,
  ensureTask,
  dockerPush,
  execCommand,
  writeRepoFile,
  REPO_ROOT,
} from '../../utils/index.js';

import path from 'path';
import { rimraf } from 'rimraf';
import mkdirp from 'mkdirp';

const tempDir = path.join(REPO_ROOT, 'temp');

/**
 * The "monoimage" is a single docker image containing all tasks.  This build process goes
 * something like this:
 *
 *  - Clone the monorepo (from the current working copy)
 *  - Build it (install dependencies, transpile, etc.)
 *    - done in a Docker volume to avoid Docker for Mac bugs
 *  - Build the docker image containing the app (/app)
 *
 *  All of this is done using a "hooks" approach to allow segmenting the various oddball bits of
 *  this process by theme.
 */
const generateMonoimageTasks = ({ tasks, baseDir, cmdOptions, credentials, logsDir }) => {
  const sourceDir = appRootDir.get();

  ensureTask(tasks, {
    title: 'Build Taskcluster Docker Image',
    requires: [
      'release-version',
      'docker-flow-version',
    ],
    provides: [
      'monoimage-docker-image', // image tag
      'monoimage-image-on-registry', // true if the image is already on registry
    ],
    locks: ['git'],
    run: async (requirements, utils) => {
      let dockerRepo = cmdOptions.dockerRepo;
      if (!dockerRepo) {
        if (cmdOptions.push) {
          throw new Error('--docker-repo must be given with --push');
        }
        // if not pushing, just name the image `taskcluster:vX.Y.Z`.
        dockerRepo = 'taskcluster';
      }
      const tag = `${dockerRepo}:v${requirements['release-version']}`;

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
        'monoimage-docker-image': tag,
        'monoimage-image-on-registry': imageOnRegistry,
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
      let command = ['docker', 'build'];
      if (!cmdOptions.cache) {
        command.push('--no-cache');
      }
      command = command.concat([
        '--progress', 'plain',
        '--tag', tag,
        '--build-arg', 'DOCKER_FLOW_VERSION=' + versionJson,
        '.']);
      await execCommand({
        command,
        dir: sourceDir,
        logfile: path.join(logsDir, 'monoimage-docker-build.log'),
        utils,
        env: { DOCKER_BUILDKIT: 1, ...process.env },
      });

      return provides;
    },
  });

  ensureTask(tasks, {
    title: 'Build Taskcluster Devel Docker Image',
    requires: [
      'monoimage-docker-image',
      'monoimage-image-on-registry',
    ],
    provides: [
      'monoimage-devel-docker-image',
      'monoimage-devel-image-on-registry',
    ],
    locks: ['git'],
    run: async (requirements, utils) => {
      const tag = requirements['monoimage-docker-image'] + '-devel';

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
      utils.status({ message: `Image does ${imageOnRegistry ? '' : 'not '} exist on registry` });

      const provides = {
        'monoimage-devel-docker-image': tag,
        'monoimage-devel-image-on-registry': imageOnRegistry,
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

      const dockerDir = path.join(tempDir, 'devel-image');
      await rimraf(dockerDir);
      await mkdirp(dockerDir);

      await writeRepoFile('temp/devel-image/Dockerfile', [
        `FROM ${requirements['monoimage-docker-image']}`,
        'USER root',
        'RUN npm install --global nodemon',
        'USER 1000',
        'RUN yarn install && yarn cache clean --all',
      ].join('\n'));

      try {
        await execCommand({
          command: ['docker', 'build', '--progress', 'plain', '--tag', tag, '.'],
          dir: dockerDir,
          logfile: path.join(logsDir, 'monoimage-devel-docker-build.log'),
          utils,
          env: { DOCKER_BUILDKIT: 1, ...process.env },
        });
      } finally {
        await rimraf(dockerDir);
      }

      return provides;
    },
  });

  ensureTask(tasks, {
    title: `Monoimage - Push Image`,
    requires: [
      `monoimage-docker-image`,
      `monoimage-image-on-registry`,
    ],
    provides: [
      `monoimage-push`,
    ],
    run: async (requirements, utils) => {
      const tag = requirements[`monoimage-docker-image`];
      const provides = { [`monoimage-push`]: tag };

      if (!cmdOptions.push) {
        return utils.skip({ provides });
      }

      if (requirements[`monoimage-image-on-registry`]) {
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
        logfile: path.join(logsDir, 'monoimage-docker-push.log'),
        tag,
        utils,
        baseDir,
        ...dockerPushOptions,
      });

      return provides;
    },
  });

  ensureTask(tasks, {
    title: `Monoimage - Push Devel Image`,
    requires: [
      `monoimage-devel-docker-image`,
      `monoimage-devel-image-on-registry`,
    ],
    provides: [
      `monoimage-devel-push`,
    ],
    run: async (requirements, utils) => {
      const tag = requirements[`monoimage-devel-docker-image`];
      const provides = { [`monoimage-devel-push`]: tag };

      if (!cmdOptions.push) {
        return utils.skip(provides);
      }

      if (requirements[`monoimage-devel-image-on-registry`]) {
        return utils.skip(provides);
      }

      const dockerPushOptions = {};
      if (credentials.dockerUsername && credentials.dockerPassword) {
        dockerPushOptions.credentials = {
          username: credentials.dockerUsername,
          password: credentials.dockerPassword,
        };
      }

      await dockerPush({
        logfile: path.join(logsDir, 'monoimage-devel-docker-push.log'),
        tag,
        utils,
        baseDir,
        ...dockerPushOptions,
      });
    },
  });

  ensureTask(tasks, {
    title: `Monoimage - Complete`,
    requires: [
      `monoimage-push`,
    ],
    provides: [
      `target-monoimage`,
    ],
    run: async (requirements, utils) => {
      return {
        'target-monoimage': `Monoimage docker image: ${requirements['monoimage-push']}`,
      };
    },
  });

  ensureTask(tasks, {
    title: `Monoimage Devel - Complete`,
    requires: [
      `monoimage-devel-push`,
    ],
    provides: [
      `target-monoimage-devel`,
    ],
    run: async (requirements, utils) => {
      return {
        'target-monoimage-devel': `Monoimage devel docker image: ${requirements['monoimage-devel-push']}`,
      };
    },
  });
};

export default generateMonoimageTasks;
