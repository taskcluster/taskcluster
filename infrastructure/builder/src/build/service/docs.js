const util = require('util');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const rimraf = util.promisify(require('rimraf'));
const mkdirp = util.promisify(require('mkdirp'));
const doT = require('dot');
const tar = require('tar-fs');
const copy = require('recursive-copy');
const {dockerRun, dockerPull, dockerImages, dockerBuild, dockerRegistryCheck,
  dirStamped, stampDir, ensureDockerImage} = require('../utils');

doT.templateSettings.strip = false;
const DOCS_DOCKERFILE_TEMPLATE = doT.template(fs.readFileSync(path.join(__dirname, 'docs-dockerfile.dot')));

exports.docsTasks = ({tasks, baseDir, spec, cfg, name, cmdOptions, repository, workDir}) => {
  const docNames = spec.build.repositories.filter(repo => repo.docs).map(repo => repo.name);

  const nginxImage = 'nginx:alpine';
  const nodeImage = `node:${repository.service.node}`;
  ensureDockerImage(tasks, baseDir, nginxImage);
  ensureDockerImage(tasks, baseDir, nodeImage);

  tasks.push({
    title: `Service ${name} - Build`,
    requires: [
      `docker-image-${nodeImage}`,
      `docker-image-${nginxImage}`,
      `repo-${name}-exact-source`,
      `repo-${name}-dir`,
      ...docNames.map(name => `docs-${name}-dir`),
      ...docNames.map(name => `repo-${name}-exact-source`),
    ],
    provides: [
      `service-${name}-built-app-dir`,
      `service-${name}-static-dir`, // result of `gulp build-static`
    ],
    locks: ['docker'],
    run: async (requirements, utils) => {
      const repoDir = requirements[`repo-${name}-dir`];
      const appDir = path.join(workDir, 'app');
      const cacheDir = path.join(workDir, 'cache');
      const staticDir = path.join(appDir, 'static');
      const sources = [name, ...docNames].map(name => requirements[`repo-${name}-exact-source`]);
      const provides = {
        [`service-${name}-built-app-dir`]: appDir,
        [`service-${name}-static-dir`]: staticDir,
      };

      if (dirStamped({dir: appDir, sources})) {
        return utils.skip({provides});
      }
      await rimraf(appDir);
      await mkdirp(cacheDir);

      utils.step({title: 'Copy Repository'});

      // copy from the repo (omitting .git as it's not needed)
      await copy(repoDir, appDir, {filter: ['**/*', '!.git'], dot: true});
      assert(fs.existsSync(appDir));

      utils.step({title: 'Copy Docs'});

      // copy each docs directory to the appropriate place
      // in the docs source tree
      for (let docName of docNames) {
        utils.status({message: docName});

        const src = requirements[`docs-${docName}-dir`];
        const project = JSON.parse(fs.readFileSync(path.join(src, 'metadata.json'))).project;
        const dst = path.join(appDir, 'raw', 'reference', project);

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

      await dockerRun({
        image: nodeImage,
        workingDir: '/app',
        command: ['/app/node_modules/.bin/gulp', 'build-static'],
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
      `service-${name}-static-dir`,
    ],
    provides: [
      `service-${name}-docker-image`, // docker image tag
      `service-${name}-image-on-registry`, // true if the image already exists on registry
    ],
    locks: ['docker'],
    run: async (requirements, utils) => {
      const staticDir = requirements[`service-${name}-static-dir`];
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

      // build a tarfile containing the build directory, Dockerfile, and ancillary files
      utils.step({title: 'Create Docker-Build Tarball'});

      const dockerfile = DOCS_DOCKERFILE_TEMPLATE({});

      const tarball = tar.pack(staticDir, {
        finalize: false,
        finish: pack => {
          pack.entry({name: 'Dockerfile'}, dockerfile);
          pack.finalize();
        },
      });

      utils.step({title: 'Building'});

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

