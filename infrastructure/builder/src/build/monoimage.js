const util = require('util');
const fs = require('fs');
const path = require('path');
const rimraf = util.promisify(require('rimraf'));
const mkdirp = util.promisify(require('mkdirp'));
const {quote} = require('shell-quote');
const tar = require('tar-fs');
const yaml = require('js-yaml');
const Stamp = require('./stamp');
const appRootDir = require('app-root-dir');
const {
  gitIsDirty,
  gitDescribe,
  dockerRun,
  dockerPull,
  dockerImages,
  dockerBuild,
  dockerRegistryCheck,
  ensureDockerImage,
  ensureDockerVolume,
  ensureTask,
  listServices,
  dockerPush,
} = require('../utils');

const DOCKER_VOLUME_NAME = 'taskcluster-builder-build';

/**
 * The "monoimage" is a single docker image containing all tasks.  This build process goes
 * something like this:
 *
 *  - Clone the monorepo (from the current working copy)
 *  - Build it (install dependencies, transpile, etc.)
 *    - generate an "entrypoint" script to allow things like "docker run <monoimage> service/web"
 *    - done in a Docker volume to avoid Docker for Mac bugs
 *  - Build the docker image containing the app (/app)
 *
 *  All of this is done using a "hooks" approach to allow segmenting the various oddball bits of
 *  this process by theme.
 */
const generateMonoimageTasks = ({tasks, baseDir, cmdOptions}) => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(appRootDir.get(), 'package.json')));
  const nodeVersion = packageJson.engines.node;

  // list of all services in the monorepo
  const services = listServices({repoDir: appRootDir.get()});

  // we need the "full" node image to install buffertools, for example..
  const nodeImage = `node:${nodeVersion}`;
  // but the alpine image can run the services..
  const nodeAlpineImage = `node:${nodeVersion}-alpine`;

  const sourceDir = appRootDir.get();

  ensureDockerImage(tasks, baseDir, nodeImage);
  ensureDockerImage(tasks, baseDir, nodeAlpineImage);

  /* Each hook has
   *  - name -- name for display
   *  - requires -- requirements for this hook
   *  - build -- async (requirements, utils) called during the build phase
   *  - entrypoints -- async (requirements, utils, procs) called to get entrypoint procs
   * Hooks run in order, so they may depend on results from previous hooks.
   */
  const hooks = [];
  hooks.push({
    name: 'Set taskcluster-version',
    requires: ['monorepo-git-descr'],
    build: async (requirements, utils) => {
      // let the services know what version they are running
      await dockerRun({
        image: nodeImage,
        workingDir: '/base/app',
        command: ['sh', '-c', `echo "${requirements['monorepo-git-descr']}" > taskcluster-version`],
        mounts: [
          {Type: 'volume', Target: '/base', Source: requirements['build-docker-volume']},
        ],
        logfile: `${baseDir}/tc-version.log`,
        utils,
        baseDir,
      });
    },
  });

  hooks.push({
    name: 'API Services',
    build: async (requirements, utils) => {
      await dockerRun({
        image: nodeImage,
        workingDir: '/base/app',
        command: ['sh', '-ce', [
          'mkdir -p /base/cache',
          'YARN_CACHE_FOLDER=/base/cache yarn install --frozen-lockfile',
          // remove some junk
          'rm -rf .node-gyp',
        ].join('\n')],
        mounts: [
          {Type: 'volume', Target: '/base', Source: requirements['build-docker-volume']},
        ],
        logfile: `${baseDir}/yarn-install.log`,
        utils,
        baseDir,
      });
    },
    entrypoints: async (requirements, utils, procs) => {
      services.forEach(name => {
        const procsPath = path.join(sourceDir, 'services', name, 'procs.yml');
        if (!fs.existsSync(procsPath)) {
          throw new Error(`Service ${name} has no procs.yml`);
        }
        const processes = yaml.safeLoad(fs.readFileSync(procsPath));
        Object.entries(processes).forEach(([proc, {command}]) => {
          procs[`${name}/${proc}`] = `cd services/${name} && ${command}`;
        });
      });
      return procs;
    },
  });

  hooks.push({
    name: 'References',
    entrypoints: async (requirements, utils, procs) => {
      // this script:
      //  - reads the references from generated/ and creates rootUrl-relative output
      //  - starts nginx to serve that rootUrl-relative output
      procs['references/web'] = 'exec sh infrastructure/references/references.sh';
    },
  });

  hooks.push({
    name: 'web-ui',
    build: async (requirements, utils, procs) => {
      await dockerRun({
        image: nodeImage,
        workingDir: '/base/app/ui',
        command: ['sh', '-ce', [
          'mkdir -p /base/cache',
          'YARN_CACHE_FOLDER=/base/cache yarn install --frozen-lockfile',
          // remove some junk
          'rm -rf .node-gyp',
        ].join('\n')],
        mounts: [
          {Type: 'volume', Target: '/base', Source: requirements['build-docker-volume']},
        ],
        logfile: `${baseDir}/yarn-ui-install.log`,
        utils,
        baseDir,
      });
    },
    entrypoints: async (requirements, utils, procs) => {
      procs['ui/web'] = 'cd /app/ui && yarn build && ' +
        ' nginx -c /app/ui/web-ui-nginx-site.conf -g \'daemon off;\'';
    },
  });

  ensureTask(tasks, {
    title: 'Set Up Docker Volume',
    requires: [],
    provides: [
      'build-docker-volume',
    ],
    locks: ['docker'],
    run: async (requirements, utils) => {
      await ensureDockerVolume({
        baseDir,
        name: DOCKER_VOLUME_NAME,
        empty: !cmdOptions.cache,
        image: nodeAlpineImage,
        utils,
      });
      return {
        'build-docker-volume': DOCKER_VOLUME_NAME,
      };
    },
  });

  ensureTask(tasks, {
    title: 'Clone Monorepo from Working Copy',
    requires: [
      'build-can-start', // (used to delay building in `yarn release`)
      'build-docker-volume',
    ],
    provides: [
      'monorepo-git-descr', // `git describe --tag --always` output
      'monorepo-stamp',
    ],
    locks: ['git'],
    run: async (requirements, utils) => {
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

      // clone the local git repository into the docker volume, using a bit of shell logic
      // to skip doing so if it's already up to date.
      const gitCloneScript = [
        'baserev=`if [ -d /base/monorepo ]; then git --git-dir=/base/monorepo/.git rev-parse HEAD; fi`',
        'srcrev=`git --git-dir=/src/.git rev-parse HEAD`',
        'if [ "$baserev" != "$srcrev" ]; then',
        // We _could_ try to manipulate the repo that already exists by
        // fetching and checking out, but it can get into weird states easily.
        // This is doubly true when we do things like set depth=1 etc.
        //
        // Instead, we just blow it away and clone. This is lightweight since we
        // do use that depth=1 anyway.
        '  rm -rf /base/monorepo',
        '  git clone /src /base/monorepo --depth 1',
        'fi',
      ].join('\n');
      await dockerRun({
        image: nodeImage,
        workingDir: '/',
        command: ['bash', '-cex', gitCloneScript],
        logfile: `${baseDir}/git-clone.log`,
        utils,
        mounts: [
          {Type: 'volume', Target: '/base', Source: requirements['build-docker-volume']},
          {Type: 'bind', Target: '/src', Source: sourceDir},
        ],
        baseDir,
      });

      const {gitDescription} = await gitDescribe({
        dir: sourceDir,
        utils,
      });

      const repoUrl = 'https://github.com/taskcluster/taskcluster';
      const stamp = new Stamp({step: 'repo-clone', version: 1},
        `${repoUrl}#${gitDescription}`);

      return {
        'monorepo-git-descr': gitDescription,
        'monorepo-stamp': stamp,
      };
    },
  });

  const buildRequires = new Set();
  hooks.forEach(({requires}) => requires && requires.forEach(req => buildRequires.add(req)));

  ensureTask(tasks, {
    title: 'Build Monorepo',
    requires: [
      'monorepo-stamp',
      `docker-image-${nodeImage}`,
      'build-docker-volume',
      ...buildRequires,
    ],
    provides: [
      'monoimage-stamp',
    ],
    locks: ['docker'],
    run: async (requirements, utils) => {
      const appStampDir = path.join(baseDir, 'app-stamp');
      const stamp = new Stamp({step: 'monoimage-build', version: 1},
        {nodeVersion},
        ...[...buildRequires]
          .filter(req => req.endsWith('-stamp'))
          .map(req => requirements[req]));

      const provides = {
        ['monoimage-stamp']: stamp,
      };

      // if we've already built this with this revision, we're done.
      if (stamp.dirStamped(appStampDir)) {
        return utils.skip({provides});
      } else {
        await rimraf(appStampDir);
      }
      await mkdirp(appStampDir);

      utils.step({title: 'Copy Source Repository'});
      await dockerRun({
        image: nodeImage,
        workingDir: '/',
        command: ['bash', '-cex', [
          'rm -rf /base/app',
          'mkdir -p /base/app',
          'tar -C /base/monorepo --exclude=./.git -cf - . | tar -C /base/app -xf -',
        ].join('\n')],
        logfile: `${baseDir}/app-copy.log`,
        utils,
        mounts: [{Type: 'volume', Target: '/base', Source: requirements['build-docker-volume']}],
        baseDir,
      });

      for (let {name, build} of hooks) {
        if (build) {
          utils.step({title: `Build Hook: ${name}`});
          await build(requirements, utils);
        }
      }

      const procs = {};
      for (let {name, entrypoints} of hooks) {
        if (entrypoints) {
          utils.step({title: `Entrypoint Hook: ${name}`});
          await entrypoints(requirements, utils, procs);
        }
      }

      const entrypointScript = []
        .concat([
          '#! /bin/sh', // note that alpine does not have bash
          'case "${1}" in',
        ])
        .concat(Object.entries(procs).map(([process, command]) =>
          `${process}) exec ${quote(['sh', '-c', command])};;`))
        .concat([
          // catch-all to run whatever command the user specified
          '*) exec "${@}";;',
          'esac',
        ]).join('\n');
      const entrypointFile = path.join(baseDir, 'entrypoint');
      fs.writeFileSync(entrypointFile, entrypointScript, {mode: 0o777});

      await dockerRun({
        image: nodeImage,
        workingDir: '/',
        command: ['bash', '-cex', 'cp /entrypoint /base/app/entrypoint'],
        logfile: `${baseDir}/entrypoint-copy.log`,
        utils,
        mounts: [
          {Type: 'volume', Target: '/base', Source: requirements['build-docker-volume']},
          {Type: 'bind', Target: '/entrypoint', Source: entrypointFile},
        ],
        baseDir,
      });

      stamp.stampDir(appStampDir);
      return provides;
    },
  });

  ensureTask(tasks, {
    title: `Build Docker Image`,
    requires: [
      'monoimage-stamp',
      'monorepo-git-descr',
      'build-docker-volume',
      `docker-image-${nodeAlpineImage}`,
    ],
    provides: [
      'monoimage-docker-image',
      'monoimage-image-on-registry',
    ],
    locks: ['docker'],
    run: async (requirements, utils) => {
      const tag = `taskcluster/taskcluster:${requirements['monorepo-git-descr']}`;

      utils.step({title: 'Check for Existing Images'});

      const imageLocal = (await dockerImages({baseDir}))
        .some(image => image.RepoTags && image.RepoTags.indexOf(tag) !== -1);
      const imageOnRegistry = await dockerRegistryCheck({tag});

      if (imageOnRegistry && !cmdOptions.cache) {
        throw new Error(
          `Image ${tag} already exists on the registry, but --no-cache was given.`);
      }

      const provides = {
        'monoimage-docker-image': tag,
        'monoimage-image-on-registry': imageOnRegistry,
      };

      // bail out if we can, pulling the image if it's only available remotely
      if (!imageLocal && imageOnRegistry) {
        await dockerPull({image: tag, utils, baseDir});
        return utils.skip({provides});
      } else if (imageLocal) {
        return utils.skip({provides});
      }

      // The bulk of the docker image is the `app` directory, currently residing on
      // the docker volume.  Docker-build cannot access volumes, though, so we must
      // copy that data to baseDir first, then pack it into a tarball for the build.

      utils.step({title: 'Copying /app out of docker volume'});

      const appDir = path.join(baseDir, 'app');
      await mkdirp(appDir);
      await dockerRun({
        image: nodeImage,
        workingDir: '/',
        command: ['bash', '-cex', 'tar -C /base/app -cf - . | tar -C /app -xf -'],
        logfile: `${baseDir}/app-copy.log`,
        utils,
        mounts: [
          {Type: 'volume', Target: '/base', Source: requirements['build-docker-volume']},
          {Type: 'bind', Target: '/app', Source: appDir},
        ],
        baseDir,
      });

      utils.step({title: 'Building'});

      const dockerfile = [
        `FROM ${nodeAlpineImage}`,
        `RUN apk update && \
          apk add nginx && \
          mkdir /run/nginx && \
          apk add bash`,
        'COPY app /app',
        'ENV HOME=/app',
        'WORKDIR /app',
        'ENTRYPOINT ["/app/entrypoint"]',
      ].join('\n');
      fs.writeFileSync(path.join(baseDir, 'Dockerfile'), dockerfile);

      const tarball = tar.pack(baseDir, {
        // include the built app dir as app/
        entries: ['app', 'Dockerfile'],
      });

      await dockerBuild({
        tarball: tarball,
        logfile: `${baseDir}/docker-build.log`,
        tag,
        utils,
        baseDir,
      });

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
      `target-monoimage`,
    ],
    run: async (requirements, utils) => {
      const tag = requirements[`monoimage-docker-image`];
      const provides = {[`target-monoimage`]: tag};

      if (!cmdOptions.push) {
        return utils.skip({provides});
      }

      if (requirements[`monoimage-image-on-registry`]) {
        return utils.skip({provides});
      }

      await dockerPush({
        logfile: `${baseDir}/docker-push.log`,
        tag,
        utils,
        baseDir,
      });

      return provides;
    },
  });
};

module.exports = generateMonoimageTasks;
