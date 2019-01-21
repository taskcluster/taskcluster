const util = require('util');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const rimraf = util.promisify(require('rimraf'));
const mkdirp = util.promisify(require('mkdirp'));
const {quote} = require('shell-quote');
const tar = require('tar-fs');
const copy = require('recursive-copy');
const Stamp = require('./stamp');
const appRootDir = require('app-root-dir');
const {gitClone, gitIsDirty, dockerRun, dockerPull, dockerImages, dockerBuild,
  dockerRegistryCheck, serviceDockerImageTask, ensureDockerImage, ensureTask,
  listServices} = require('./utils');

const generateMonoimageTasks = ({tasks, baseDir, spec, cfg, cmdOptions}) => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(appRootDir.get(), 'package.json')));
  const nodeVersion = packageJson.engines.node;
  const workDir = path.join(baseDir, 'monoimage');

  const services = listServices({repoDir: appRootDir.get()});

  // we need the "full" node image to install buffertools, for example..
  const nodeImage = `node:${nodeVersion}`;
  // but the alpine image can run the services..
  const nodeAlpineImage = `node:${nodeVersion}-alpine`;

  ensureDockerImage(tasks, baseDir, nodeImage);
  ensureDockerImage(tasks, baseDir, nodeAlpineImage);

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

  ensureTask(tasks, {
    title: 'Build Monorepo',
    requires: [
      'monorepo-dir',
      'monorepo-exact-source',
      'monorepo-stamp',
      `docker-image-${nodeImage}`,
    ],
    provides: [
      'monoimage-built-app-dir',
      'monoimage-stamp',
    ],
    locks: ['docker'],
    run: async (requirements, utils) => {
      const repoDir = requirements['monorepo-dir'];
      const appDir = path.join(workDir, 'app');
      const revision = requirements['monorepo-exact-source'].split('#')[1];

      const stamp = new Stamp({step: 'monoimage-compile', version: 1},
        {nodeVersion},
        requirements['monorepo-stamp']);
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

      // let the services learn their git version
      fs.writeFileSync(path.join(appDir, '.git-version'), revision);

      utils.step({title: 'Yarn Install'});

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

      utils.step({title: 'Create Entrypoint Script'});

      const procs = [];
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
          procs.push({service: name, process: parts[1], command: parts[2]});
        });
      });
      const entrypoint = []
        .concat([
          '#! /bin/sh', // note that alpine does not have bash
          'case "${1}" in',
        ])
        .concat(procs.map(({service, process, command}) =>
          // each Procfile entry will be runnable as <serviceName>/<process>
          `${service}/${process}) exec ${quote(['sh', '-c', command])};;`))
        .concat([
          // catch-all to run whatever command the user specified
          '*) exec "${@}";;',
          'esac',
        ]).join('\n');
      fs.writeFileSync(path.join(appDir, 'entrypoint'), entrypoint, {mode: 0o777});

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
      const dockerfile = [
        `FROM ${nodeAlpineImage}`,
        'COPY app /app',
        'ENV HOME=/app',
        'WORKDIR /app',
        'ENTRYPOINT ["/app/entrypoint"]',
      ].join('\n');

      fs.writeFileSync(path.join(workDir, 'Dockerfile'), dockerfile);

      const tarball = tar.pack(workDir, {
        entries: ['app', 'Dockerfile'],
      });

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

  services.forEach(name => {
    tasks.push({
      title: `Service ${name} - Generate Docs`,
      requires: [
        `monoimage-built-app-dir`,
        `monoimage-stamp`,
        `docker-image-${nodeAlpineImage}`,
      ],
      provides: [
        `docs-${name}-dir`,
        `docs-${name}-stamp`,
      ],
      locks: ['docker'],
      run: async (requirements, utils) => {
        const appDir = requirements['monoimage-built-app-dir'];
        // note that docs directory paths must have this form (${basedir}/docs is
        // mounted in docker images)
        const docsDir = path.join(baseDir, 'docs', name);

        const stamp = new Stamp({step: 'service-docs', version: 1},
          requirements['monoimage-stamp']);
        const provides = {
          [`docs-${name}-dir`]: docsDir,
          [`docs-${name}-stamp`]: stamp,
        };

        // if we've already built this docsDir with this revision, we're done.
        if (stamp.dirStamped(docsDir)) {
          return utils.skip({provides});
        }
        await rimraf(docsDir);
        await mkdirp(path.dirname(docsDir));

        await dockerRun({
          image: nodeAlpineImage,
          command: ['/app/entrypoint', `${name}/write-docs`],
          env: [
            `DOCS_OUTPUT_DIR=/basedir/docs/${name}`,
            'NODE_ENV=production',
            'PUBLISH_METADATA=false', // this defaults to true otherwise..
          ],
          logfile: `${workDir}/generate-${name}-docs.log`,
          workingDir: '/app',
          utils,
          binds: [
            `${appDir}:/app`,
            `${baseDir}:/basedir`,
          ],
          baseDir,
        });

        // some services don't actually generate anything, so mkdir for them
        await mkdirp(docsDir);

        stamp.stampDir(docsDir);
        return provides;
      },
    });
  });
};

module.exports = generateMonoimageTasks;
