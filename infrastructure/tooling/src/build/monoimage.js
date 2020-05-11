const appRootDir = require('app-root-dir');
const {
  gitIsDirty,
  gitDescribe,
  dockerFlowVersion,
  dockerPull,
  dockerImages,
  dockerRegistryCheck,
  ensureTask,
  dockerPush,
  execCommand,
  writeRepoFile,
  REPO_ROOT,
} = require('../utils');
const path = require('path');
const util = require('util');
const rimraf = util.promisify(require('rimraf'));
const mkdirp = util.promisify(require('mkdirp'));

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
const generateMonoimageTasks = ({tasks, baseDir, cmdOptions, credentials, logsDir}) => {
  const sourceDir = appRootDir.get();

  ensureTask(tasks, {
    title: 'Build Taskcluster Docker Image',
    requires: [
      'build-can-start', // (used to delay building in `yarn release`)
    ],
    provides: [
      'monoimage-docker-image', // image tag
      'monoimage-image-on-registry', // true if the image is already on registry
    ],
    locks: ['git'],
    run: async (requirements, utils) => {
      utils.step({title: 'Check Repository'});

      // Clone from the current working copy, rather than anything upstream;
      // this avoids the need to land-and-push changes.  This is a git clone
      // operation instead of a raw filesystem copy so that any non-checked-in
      // files are not accidentally built into docker images.
      if (!cmdOptions.ignoreUncommittedFiles) {
        if (await gitIsDirty({dir: sourceDir})) {
          throw new Error([
            'The current git working copy is not clean. Any non-checked-in files will',
            'not be reflected in the built image, so this is treatd as an error by default.',
            'Either check in the dirty files, or run with --ignore-uncommitted-files to',
            'override this error.  Never check in files containing secrets!',
          ].join(' '));
        }
      }

      const {gitDescription, revision} = await gitDescribe({
        dir: sourceDir,
        utils,
      });
      const tag = `taskcluster/taskcluster:${gitDescription}`;

      utils.step({title: 'Check for Existing Images'});

      const imageLocal = (await dockerImages({baseDir}))
        .some(image => image.RepoTags && image.RepoTags.indexOf(tag) !== -1);
      const imageOnRegistry = await dockerRegistryCheck({tag});

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
        await dockerPull({image: tag, utils, baseDir});
        return utils.skip({provides});
      } else if (imageLocal) {
        return utils.skip({provides});
      }

      utils.step({title: 'Building Docker Image'});

      let versionJson = dockerFlowVersion({gitDescription, revision});
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
        logfile: path.join(logsDir, 'docker-build.log'),
        utils,
        env: {DOCKER_BUILDKIT: 1, ...process.env},
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
      const tag = requirements['monoimage-docker-image']
        .replace(/taskcluster:/, 'taskcluster-devel:');

      utils.step({title: 'Check for Existing Images'});

      const imageLocal = (await dockerImages({baseDir}))
        .some(image => image.RepoTags && image.RepoTags.indexOf(tag) !== -1);
      const imageOnRegistry = await dockerRegistryCheck({tag});

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
        await dockerPull({image: tag, utils, baseDir});
        return utils.skip({provides});
      } else if (imageLocal) {
        return utils.skip({provides});
      }

      utils.step({title: 'Building Docker Image'});

      const dockerDir = path.join(tempDir, 'devel-image');
      await rimraf(dockerDir);
      await mkdirp(dockerDir);

      await writeRepoFile('temp/devel-image/Dockerfile', [
        `FROM ${requirements['monoimage-docker-image']}`,
        'RUN yarn install',
      ].join('\n'));

      try {
        await execCommand({
          command: ['docker', 'build', '--progress', 'plain', '--tag', tag, '.'],
          dir: dockerDir,
          logfile: path.join(logsDir, 'docker-build-devel.log'),
          utils,
          env: {DOCKER_BUILDKIT: 1, ...process.env},
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
      const provides = {[`monoimage-push`]: tag};

      if (!cmdOptions.push) {
        return utils.skip({provides});
      }

      if (requirements[`monoimage-image-on-registry`]) {
        return utils.skip({provides});
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

      if (!cmdOptions.push) {
        return utils.skip({reason: "--push not present"});
      }

      if (requirements[`monoimage-devel-image-on-registry`]) {
        return utils.skip({reason: "already on registry"});
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
    },
  });

  ensureTask(tasks, {
    title: `Monoimage - Complete`,
    requires: [
      `monoimage-push`,
      `monoimage-devel-push`,
    ],
    provides: [
      `target-monoimage`,
    ],
    run: async (requirements, utils) => {
      const tag = requirements[`monoimage-push`];
      const provides = {[`target-monoimage`]: tag};

      return provides;
    },
  });
};

module.exports = generateMonoimageTasks;
