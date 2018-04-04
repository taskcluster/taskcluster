const _ = require('lodash');
const util = require('util');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const split = require('split');
const rimraf = util.promisify(require('rimraf'));
const mkdirp = util.promisify(require('mkdirp'));
const git = require('simple-git/promise');
const doT = require('dot');
const {quote} = require('shell-quote');
const yaml = require('js-yaml');
const tar = require('tar-fs');
const tarStream = require('tar-stream');
const copy = require('recursive-copy');
const {gitClone, dockerRun, dockerPull, dockerImages, dockerBuild, dockerRegistryCheck,
  dockerPush, dirStamped, stampDir} = require('./utils');

doT.templateSettings.strip = false;
const ENTRYPOINT_TEMPLATE = doT.template(fs.readFileSync(path.join(__dirname, 'entrypoint.dot')));
const HEROKU_DOCKERFILE_TEMPLATE = doT.template(fs.readFileSync(path.join(__dirname, 'heroku-dockerfile.dot')));
const TOOLS_UI_DOCKERFILE_TEMPLATE = doT.template(fs.readFileSync(path.join(__dirname, 'tools-ui-dockerfile.dot')));

const generateServiceTasks = ({tasks, baseDir, spec, cfg, name, cmdOptions}) => {
  const repository = _.find(spec.build.repositories, {name});
  const workDir = path.join(baseDir, `service-${name}`);
  if (!fs.existsSync(workDir)) {
    fs.mkdirSync(workDir);
  }

  switch (repository.service.buildtype) {
    case 'heroku-buildpack':
      herokuBuildpackTasks({tasks, baseDir, spec, cfg, name, cmdOptions, repository, workDir});
      break;

    case 'tools-ui':
      toolsUiTasks({tasks, baseDir, spec, cfg, name, cmdOptions, repository, workDir});
      break;

    default:
      throw new Error(`Unknown buildtype ${repository.service.buildtype}`);
  }

  tasks.push({
    title: `Service ${name} - Push Image`,
    requires: [
      `service-${name}-docker-image`,
      `service-${name}-image-on-registry`,
    ],
    provides: [
    ],
    run: async (requirements, utils) => {
      const tag = requirements[`service-${name}-docker-image`];

      if (!cmdOptions.push) {
        return utils.skip({});
      }

      if (requirements[`service-${name}-image-on-registry`]) {
        throw new Error(`Image ${tag} already exists on the registry; not pushing`);
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

// add a task to tasks only if it isn't already there
const ensureTask = (tasks, task) => {
  if (!_.find(tasks, {title: task.title})) {
    tasks.push(task);
  }
};

// ensure a docker image is present (setting `docker-image-${image}`)
const ensureDockerImage = (tasks, baseDir, image) => {
  ensureTask(tasks, {
    title: `Pull Docker Image ${image}`,
    requires: [],
    provides: [
      `docker-image-${image}`,
    ],
    run: async (requirements, utils) => {
      const images = await dockerImages({baseDir});
      const exists = (await dockerImages({baseDir}))
        .some(i => i.RepoTags && i.RepoTags.indexOf(image) !== -1);
      if (exists) {
        return utils.skip({
          [`docker-image-${image}`]: image,
        });
      }

      await dockerPull({image, utils, baseDir});
      return {
        [`docker-image-${image}`]: image,
      };
    },
  });
};

const herokuBuildpackTasks = ({tasks, baseDir, spec, cfg, name, cmdOptions, repository, workDir}) => {
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
        return utils.skip(provides);
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
    run: async (requirements, utils) => {
      const repoDir = requirements[`repo-${name}-dir`];
      const appDir = path.join(workDir, 'app');
      const bpDir = requirements[`repo-${buildpackName}-dir`];
      const provides = {
        [`service-${name}-built-app-dir`]: appDir,
      };

      // if we've already built this appDir with this revision, we're done.
      if (dirStamped({dir: appDir, sources: requirements[`repo-${name}-exact-source`]})) {
        return utils.skip(provides);
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
        return utils.skip(provides);
      } else if (imageLocal) {
        return utils.skip(provides);
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
          return utils.skip(provides);
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

const toolsUiTasks = ({tasks, baseDir, spec, cfg, name, cmdOptions, repository, workDir}) => {
  const docNames = spec.build.repositories.filter(repo => repo.docs).map(repo => repo.name);

  const nodeImage = `node:${repository.service.node}`;
  ensureDockerImage(tasks, baseDir, nodeImage);

  tasks.push({
    title: `Service ${name} - Build`,
    requires: [
      `docker-image-${nodeImage}`,
      `repo-${name}-exact-source`,
      `repo-${name}-dir`,
      ...docNames.map(name => `docs-${name}-dir`),
      ...docNames.map(name => `repo-${name}-exact-source`),
    ],
    provides: [
      `service-${name}-built-app-dir`,
      `service-${name}-build-dir`, // result of `yarn build`
    ],
    run: async (requirements, utils) => {
      const repoDir = requirements[`repo-${name}-dir`];
      const appDir = path.join(workDir, 'app');
      const cacheDir = path.join(workDir, 'cache');
      const buildDir = path.join(appDir, 'build');
      const sources = [name, ...docNames].map(name => requirements[`repo-${name}-exact-source`]);
      const provides = {
        [`service-${name}-built-app-dir`]: appDir,
        [`service-${name}-build-dir`]: buildDir,
      };

      if (dirStamped({dir: appDir, sources})) {
        return utils.skip(provides);
      }
      await rimraf(appDir);
      await mkdirp(cacheDir);

      utils.step({title: 'Copy Repository'});

      // copy from the repo (omitting .git as it's not needed)
      await copy(repoDir, appDir, {filter: ['**/*', '!.git'], dot: true});
      assert(fs.existsSync(appDir));

      utils.step({title: 'Copy Docs'});

      // copy each docs directory to the appropriate place
      // in the tools source tree
      for (let docName of docNames) {
        utils.status({message: docName});

        const src = requirements[`docs-${docName}-dir`];
        const tier = JSON.parse(fs.readFileSync(path.join(src, 'metadata.json'))).tier;
        const dst = path.join(appDir, 'src', 'docs', 'reference', tier, docName);

        await mkdirp(path.dirname(dst));
        await copy(src, dst, {dot: true});
      }

      utils.step({title: 'Install Dependencies'});

      await dockerRun({
        image: nodeImage,
        workingDir: '/app',
        env: ['YARN_CACHE_FOLDER=/cache'],
        command: ['yarn'],
        logfile: `${workDir}/yarn.log`,
        utils,
        binds: [
          `${appDir}:/app`,
          `${cacheDir}:/cache`,
        ],
        baseDir,
      });

      utils.step({title: 'Build'});
      utils.status({message: '(this takes several minutes, with no additional output -- be patient)'});

      await dockerRun({
        image: nodeImage,
        workingDir: '/app',
        command: ['yarn', 'build'],
        logfile: `${workDir}/yarn-build.log`,
        utils,
        binds: [
          `${appDir}:/app`,
        ],
        baseDir,
      });

      stampDir({dir: appDir, sources});
      return provides;
    },
  });

  tasks.push({
    title: `Service ${name} - Build Image`,
    requires: [
      `repo-${name}-exact-source`,
      `service-${name}-build-dir`,
    ],
    provides: [
      `service-${name}-docker-image`, // docker image tag
      `service-${name}-image-on-registry`, // true if the image already exists on registry
    ],
    run: async (requirements, utils) => {
      const buildDir = requirements[`service-${name}-build-dir`];
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
        return utils.skip(provides);
      } else if (imageLocal) {
        return utils.skip(provides);
      }

      // build a tarfile containing the build directory, Dockerfile, and ancillary files
      utils.step({title: 'Create Docker-Build Tarball'});

      const dockerfile = TOOLS_UI_DOCKERFILE_TEMPLATE({});

      const tarball = tar.pack(buildDir, {
        finalize: false,
        map: header => {
          header.name = `build/${header.name}`;
          return header;
        },
        finish: pack => {
          pack.entry({name: 'Dockerfile'},
            TOOLS_UI_DOCKERFILE_TEMPLATE({}));
          // TODO: maybe this file should be in the build spec???
          pack.entry({name: 'nginx-site.conf'},
            fs.readFileSync(path.join(__dirname, 'tools-ui-nginx-site.conf')));
          pack.finalize();
        },
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

};

module.exports = generateServiceTasks;
