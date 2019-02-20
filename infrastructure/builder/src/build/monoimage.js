const util = require('util');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const rimraf = util.promisify(require('rimraf'));
const {quote} = require('shell-quote');
const tar = require('tar-fs');
const copy = require('recursive-copy');
const Stamp = require('./stamp');
const appRootDir = require('app-root-dir');
const {
  gitClone,
  gitIsDirty,
  dockerRun,
  dockerPull,
  dockerImages,
  dockerBuild,
  dockerRegistryCheck,
  ensureDockerImage,
  ensureTask,
  listServices,
  dockerPush,
} = require('./utils');

/**
 * The "monoimage" is a single docker image containing all tasks.  This build process goes
 * something like this:
 *
 *  - Clone the monorepo (from the current working copy)
 *  - Build it (install dependencies, transpile, etc.)
 *    - generate an "entrypoint" script to allow things like "docker run <monoimage> service/web"
 *  - Build the docker image containing the app (/app)
 *
 *  All of this is done using a "hooks" approach to allow segmenting the various oddball bits of
 *  this process by theme.
 */
const generateMonoimageTasks = ({tasks, baseDir, spec, cfg, cmdOptions}) => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(appRootDir.get(), 'package.json')));
  const nodeVersion = packageJson.engines.node;
  const workDir = path.join(baseDir, 'monoimage');
  const appDir = path.join(workDir, 'app');

  // list of all services in the monorepo
  const services = listServices({repoDir: appRootDir.get()});

  // we need the "full" node image to install buffertools, for example..
  const nodeImage = `node:${nodeVersion}`;
  // but the alpine image can run the services..
  const nodeAlpineImage = `node:${nodeVersion}-alpine`;

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
    name: 'Set .git-version',
    requires: ['monorepo-exact-source'],
    build: async (requirements, utils) => {
      // let the services learn their git version
      const revision = requirements['monorepo-exact-source'].split('#')[1];
      fs.writeFileSync(path.join(appDir, '.git-version'), revision);
    },
  });

  hooks.push({
    name: 'API Services',
    build: async (requirements, utils) => {
      const cacheDir = path.join(workDir, 'cache');
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir);
      }

      await dockerRun({
        image: nodeImage,
        workingDir: '/app',
        command: ['yarn', 'install', '--frozen-lockfile'],
        binds: [
          `${appDir}:/app`,
          `${cacheDir}:/cache`,
        ],
        env: [
          'YARN_CACHE_FOLDER=/cache',
        ],
        logfile: `${workDir}/yarn-install.log`,
        utils,
        baseDir,
      });

      // remove the junk in .node-gyp
      await rimraf(path.join(appDir, '.node-gyp'));
    },
    entrypoints: async (requirements, utils, procs) => {
      services.forEach(name => {
        const procfilePath = path.join(appDir, 'services', name, 'Procfile');
        if (!fs.existsSync(procfilePath)) {
          throw new Error(`Service ${name} has no Procfile`);
        }
        const Procfile = fs.readFileSync(procfilePath).toString();
        Procfile.split('\n').forEach(line => {
          if (!line || line.startsWith('#')) {
            return;
          }
          const parts = /^([^:]+):?\s+(.*)$/.exec(line.trim());
          if (!parts) {
            throw new Error(`unexpected line in Procfile: ${line}`);
          }
          // each Procfile entry will be runnable as <serviceName>/<process>
          procs[`${name}/${parts[1]}`] = parts[2];
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
    name: 'Web-Server',
    build: async (requirements, utils) => {
      utils.step({title: 'Run `yarn build` for web-server'});
      await dockerRun({
        image: nodeImage,
        workingDir: '/app/services/web-server',
        command: ['yarn', 'build'],
        binds: [
          `${appDir}:/app`,
        ],
        logfile: `${workDir}/yarn-build.log`,
        utils,
        baseDir,
      });
    },
    entrypoints: async (requirements, utils, procs) => {
      // since we ran `yarn build` already, there's no need to run it again
      // on startup, so remove it from the entrypoint commands
      Object.keys(procs).forEach(process => {
        if (process.startsWith('web-server/')) {
          procs[process] = procs[process].replace('yarn build && ', '');
        }
      });
    },
  });

  hooks.push({
    name: 'web-ui',
    build: async (requirements, utils, procs) => {
      const cacheDir = path.join(workDir, 'cache');
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir);
      }

      utils.step({title: 'Run Yarn Install'});

      await dockerRun({
        image: nodeImage,
        workingDir: '/app/ui',
        env: ['YARN_CACHE_FOLDER=/cache'],
        command: ['yarn', 'install'],
        logfile: `${workDir}/yarn-ui.log`,
        utils,
        binds: [
          `${appDir}:/app/ui`,
          `${cacheDir}:/cache`,
        ],
        baseDir,
      });

      utils.step({title: 'Run Yarn Build'});

      await dockerRun({
        image: nodeImage,
        workingDir: '/app/ui',
        command: ['yarn', 'build'],
        logfile: `${workDir}/yarn.log`,
        utils,
        binds: [
          `${appDir}:/app/ui`,
        ],
        baseDir,
      });
    },
    entrypoints: async (requirements, utils, procs) => {
      // since we ran `yarn build` already, there's no need to run it again
      // on startup, so remove it from the entrypoint commands
      Object.keys(procs).forEach(process => {
        if (process.startsWith('web-ui/')) {
          procs[process] = procs[process].replace('yarn build && ', '');
        }
      });
    },
  });

  ensureTask(tasks, {
    title: 'Clone Monorepo from Working Copy',
    provides: [
      'monorepo-dir', // full path of the repository
      'monorepo-exact-source', // exact source URL for the repository
      'monorepo-stamp',
    ],
    locks: ['git'],
    run: async (requirements, utils) => {
      const sourceDir = appRootDir.get();
      const repoDir = path.join(baseDir, 'monorepo');

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
      const {exactRev, changed} = await gitClone({
        dir: repoDir,
        url: sourceDir + '#HEAD',
        utils,
      });

      const repoUrl = 'https://github.com/taskcluster/taskcluster';
      const stamp = new Stamp({step: 'repo-clone', version: 1},
        `${repoUrl}#${exactRev}`);

      const provides = {
        'monorepo-dir': repoDir,
        'monorepo-exact-source': `${repoUrl}#${exactRev}`,
        'monorepo-stamp': stamp,
      };

      // we needed to know some information about this repo up-front, so we
      // got it from the working copy we're running from.  Now, double-check
      // that the information is still correct in the checked-out copy of
      // the repo
      const clonedPackageJson = JSON.parse(fs.readFileSync(path.join(repoDir, 'package.json')));
      const clonedNodeVersion = clonedPackageJson.engines.node;
      assert.equal(clonedNodeVersion, nodeVersion,
        'the local working copy has a different engins.node from the ' +
        'monorepo revision being built; this is not supported');

      const clonedServices = listServices({repoDir});
      assert.deepEqual(clonedServices, services,
        'the local working copy has a different set of services from the ' +
        'monorepo revision being built; this is not supported');

      if (changed) {
        return provides;
      } else {
        return utils.skip({provides});
      }
    },
  });

  const buildRequires = new Set([
    'monorepo-dir',
    'monorepo-exact-source',
    'monorepo-stamp',
    `docker-image-${nodeImage}`,
  ]);
  hooks.forEach(({requires}) => requires && requires.forEach(req => buildRequires.add(req)));

  ensureTask(tasks, {
    title: 'Build Monorepo',
    requires: [...buildRequires],
    provides: [
      'monoimage-built-app-dir',
      'monoimage-stamp',
    ],
    locks: ['docker'],
    run: async (requirements, utils) => {
      const repoDir = requirements['monorepo-dir'];

      const stamp = new Stamp({step: 'monoimage-build', version: 1},
        {nodeVersion},
        ...[...buildRequires]
          .filter(req => req.endsWith('-stamp'))
          .map(req => requirements[req]));
      const provides = {
        ['monoimage-built-app-dir']: appDir,
        ['monoimage-stamp']: stamp,
      };

      // if we've already built this appDir with this revision, we're done.
      if (stamp.dirStamped(appDir)) {
        return utils.skip({provides});
      } else {
        await rimraf(appDir);
      }

      utils.step({title: 'Copy Source Repository'});
      const filter = ['**/*', '!**/node_modules/**', '!**/node_modules', '!**/.git/**', '!**/.git'];
      await copy(repoDir, appDir, {filter, dot: true});

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
      fs.writeFileSync(path.join(appDir, 'entrypoint'), entrypointScript, {mode: 0o777});

      stamp.stampDir(appDir);
      return provides;
    },
  });

  ensureTask(tasks, {
    title: `Build Monoimage`,
    requires: [
      'monoimage-stamp',
      'monoimage-built-app-dir',
      `docker-image-${nodeAlpineImage}`,
    ],
    provides: [
      'monoimage-docker-image',
      'monoimage-image-on-registry',
    ],
    locks: ['docker'],
    run: async (requirements, utils) => {

      // find the requirements ending in '-stamp' that we should depend on
      const stamp = new Stamp({step: 'build-image', version: 1},
        {nodeAlpineImage},
        requirements['monoimage-stamp']);
      const tag = `${cfg.docker.repositoryPrefix}monoimage:SVC-${stamp.hash()}`;

      utils.step({title: 'Check for Existing Images'});

      const imageLocal = (await dockerImages({baseDir}))
        .some(image => image.RepoTags && image.RepoTags.indexOf(tag) !== -1);
      const imageOnRegistry = await dockerRegistryCheck({tag});

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

      utils.step({title: 'Building'});

      const appDir = requirements['monoimage-built-app-dir'];
      const tarball = tar.pack(workDir, {
        // include the built app dir as app/
        entries: ['app', 'Dockerfile'],
      });

      const dockerfile = [
        `FROM ${nodeAlpineImage}`,
        'RUN apk update && apk add nginx && mkdir /run/nginx',
        'COPY app /app',
        'ENV HOME=/app',
        'WORKDIR /app',
        'ENTRYPOINT ["/app/entrypoint"]',
      ].join('\n');
      fs.writeFileSync(path.join(workDir, 'Dockerfile'), dockerfile);

      await dockerBuild({
        tarball: tarball,
        logfile: `${workDir}/docker-build.log`,
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
        logfile: `${workDir}/docker-push.log`,
        tag,
        utils,
        baseDir,
      });

      return provides;
    },
  });
};

module.exports = generateMonoimageTasks;
