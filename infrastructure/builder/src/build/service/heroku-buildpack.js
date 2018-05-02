const util = require('util');
const fs = require('fs');
const path = require('path');
const rimraf = util.promisify(require('rimraf'));
const mkdirp = util.promisify(require('mkdirp'));
const doT = require('dot');
const {quote} = require('shell-quote');
const tar = require('tar-fs');
const copy = require('recursive-copy');
const {gitClone, dockerRun, dockerPull, dockerImages, dockerBuild, dockerRegistryCheck,
  dirStamped, stampDir, ensureDockerImage, ensureTask} = require('../utils');

doT.templateSettings.strip = false;
const ENTRYPOINT_TEMPLATE = doT.template(fs.readFileSync(path.join(__dirname, 'entrypoint.dot')));
const HEROKU_DOCKERFILE_TEMPLATE = doT.template(fs.readFileSync(path.join(__dirname, 'heroku-dockerfile.dot')));

exports.herokuBuildpackTasks = ({tasks, baseDir, spec, cfg, name, cmdOptions, repository, workDir}) => {
  const stackImage = `heroku/${repository.service.stack.replace('-', ':')}`;
  const buildImage = `heroku/${repository.service.stack.replace('-', ':')}-build`;
  const buildpackUrl = repository.service.buildpack;
  const buildpackName = buildpackUrl.startsWith('https://github.com/heroku/') ?
    buildpackUrl.split('/')[4] : buildpackUrl.replace('/', '_');

  ensureDockerImage(tasks, baseDir, stackImage);
  ensureDockerImage(tasks, baseDir, buildImage);

  ensureTask(tasks, {
    title: `Clone ${buildpackName}`,
    requires: [],
    provides: [
      `repo-${buildpackName}-dir`,
    ],
    run: async (requirements, utils) => {
      const repoDir = path.join(baseDir, `repo-${buildpackName}-dir`);
      const provides = {
        [`repo-${buildpackName}-dir`]: repoDir,
      };

      const {exactRev, changed} = await gitClone({
        dir: repoDir,
        url: buildpackUrl,
        utils,
      });

      if (changed) {
        return provides;
      } else {
        return utils.skip({provides});
      }
    },
  });

  tasks.push({
    title: `Service ${name} - Compile`,
    requires: [
      `repo-${name}-dir`,
      `repo-${name}-exact-source`,
      `docker-image-${buildImage}`,
      `repo-${buildpackName}-dir`,
    ],
    provides: [
      `service-${name}-built-app-dir`,
    ],
    locks: ['docker'],
    run: async (requirements, utils) => {
      const repoDir = requirements[`repo-${name}-dir`];
      const appDir = path.join(workDir, 'app');
      const bpDir = requirements[`repo-${buildpackName}-dir`];
      const provides = {
        [`service-${name}-built-app-dir`]: appDir,
      };
      const revision = requirements[`repo-${name}-exact-source`].split('#')[1];

      // if we've already built this appDir with this revision, we're done.
      if (dirStamped({dir: appDir, sources: requirements[`repo-${name}-exact-source`]})) {
        return utils.skip({provides});
      } else {
        await rimraf(appDir);
      }

      utils.step({title: 'Copy Source Repository'});
      await copy(repoDir, appDir, {filter: ['**/*', '!.git'], dot: true});

      utils.step({title: 'Buildpack Detect'});

      await dockerRun({
        image: buildImage,
        command: ['/buildpack/bin/detect', '/app'],
        binds: [
          `${bpDir}:/buildpack`,
          `${appDir}:/app`,
        ],
        logfile: `${workDir}/detect.log`,
        utils,
        baseDir,
      });

      utils.step({title: 'Buildpack Compile'});

      const envDir = path.join(workDir, 'env');
      const cacheDir = path.join(workDir, 'cache');
      if (fs.existsSync(envDir)) {
        await rimraf(envDir);
      }
      [envDir, cacheDir].forEach(dir => {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir);
        }
      });

      await dockerRun({
        image: buildImage,
        command: ['/buildpack/bin/compile', '/app', '/cache', '/env'],
        binds: [
          `${bpDir}:/buildpack`,
          `${appDir}:/app`,
          `${envDir}:/env`,
          `${cacheDir}:/cache`,
        ],
        env: [
          `STACK=${repository.service.stack}`,
          `SOURCE_VERSION=${revision}`,
        ],
        logfile: `${workDir}/compile.log`,
        utils,
        baseDir,
      });

      utils.step({title: 'Create Entrypoint Script'});

      const procfilePath = path.join(appDir, 'Procfile');
      if (!fs.existsSync(procfilePath)) {
        throw new Error(`Service ${name} has no Procfile`);
      }
      const Procfile = fs.readFileSync(procfilePath).toString();
      const procs = Procfile.split('\n').map(line => {
        if (!line || line.startsWith('#')) {
          return null;
        }
        const parts = /^([^:]+):?\s+(.*)$/.exec(line.trim());
        if (!parts) {
          throw new Error(`unexpected line in Procfile: ${line}`);
        }
        return {name: parts[1], command: quote([parts[2]])};
      }).filter(l => l !== null);
      const entrypoint = ENTRYPOINT_TEMPLATE({procs});
      fs.writeFileSync(path.join(appDir, 'entrypoint'), entrypoint, {mode: 0o777});

      stampDir({dir: appDir, sources: requirements[`repo-${name}-exact-source`]});
      return provides;
    },
  });

  tasks.push({
    title: `Service ${name} - Build Image`,
    requires: [
      `repo-${name}-exact-source`,
      `service-${name}-built-app-dir`,
      `docker-image-${stackImage}`,
    ],
    provides: [
      `service-${name}-docker-image`, // docker image tag
      `service-${name}-image-on-registry`, // true if the image already exists on registry
    ],
    locks: ['docker'],
    run: async (requirements, utils) => {
      const appDir = requirements[`service-${name}-built-app-dir`];
      const headRef = requirements[`repo-${name}-exact-source`].split('#')[1];
      const tag = `${cfg.docker.repositoryPrefix}${name}:${headRef}`;

      utils.step({title: 'Check for Existing Images'});

      const imageLocal = (await dockerImages({baseDir}))
        .some(image => image.RepoTags && image.RepoTags.indexOf(tag) !== -1);
      const imageOnRegistry = await dockerRegistryCheck({tag});

      const provides = {
        [`service-${name}-docker-image`]: tag,
        [`service-${name}-image-on-registry`]: imageOnRegistry,
      };

      // bail out if we can, pulling the image if it's only available remotely
      if (!imageLocal && imageOnRegistry) {
        await dockerPull({image: tag, utils, baseDir});
        return utils.skip({provides});
      } else if (imageLocal) {
        return utils.skip({provides});
      }

      // build a tarfile containing the app directory and Dockerfile
      utils.step({title: 'Create Docker-Build Tarball'});

      const dockerfile = HEROKU_DOCKERFILE_TEMPLATE({stackImage});
      fs.writeFileSync(path.join(workDir, 'Dockerfile'), dockerfile);

      const appGitDir = path.join(appDir, '.git');
      const tarball = tar.pack(workDir, {
        entries: ['app', 'Dockerfile'],
        ignore: fulname => name.startsWith(appGitDir),
      });

      await dockerBuild({
        tarball,
        logfile: `${workDir}/docker-build.log`,
        tag,
        utils,
        baseDir,
      });

      return provides;
    },
  });

  if (repository.docs === 'generated') {
    tasks.push({
      title: `Service ${name} - Generate Docs`,
      requires: [
        `repo-${name}-exact-source`,
        `service-${name}-built-app-dir`,
        `docker-image-${stackImage}`,
      ],
      provides: [
        `docs-${name}-dir`,
      ],
      locks: ['docker'],
      run: async (requirements, utils) => {
        const appDir = requirements[`service-${name}-built-app-dir`];
        // note that docs directory paths must have this form (${basedir}/docs is
        // mounted in docker images)
        const docsDir = path.join(baseDir, 'docs', name);
        const provides = {
          [`docs-${name}-dir`]: docsDir,
        };

        // if we've already built this docsDir with this revision, we're done.
        if (dirStamped({dir: docsDir, sources: requirements[`repo-${name}-exact-source`]})) {
          return utils.skip({provides});
        }
        await rimraf(docsDir);
        await mkdirp(path.dirname(docsDir));

        await dockerRun({
          image: stackImage,
          command: ['/app/entrypoint', 'write-docs'],
          env: [
            `DOCS_OUTPUT_DIR=/basedir/docs/${name}`,
            'NODE_ENV=production',
            'PUBLISH_METADATA=false', // this defaults to true otherwise..
          ],
          logfile: `${workDir}/generate-docs.log`,
          utils,
          binds: [
            `${appDir}:/app`,
            `${baseDir}:/basedir`,
          ],
          baseDir,
        });

        stampDir({dir: docsDir, sources: requirements[`repo-${name}-exact-source`]});
        return provides;
      },
    });
  }
};

