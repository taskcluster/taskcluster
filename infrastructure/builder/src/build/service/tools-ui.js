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
const TOOLS_UI_DOCKERFILE_TEMPLATE = doT.template(fs.readFileSync(path.join(__dirname, 'tools-ui-dockerfile.dot')));

exports.toolsUiTasks = ({tasks, baseDir, spec, cfg, name, cmdOptions, repository, workDir}) => {
  const nodeImage = `node:${repository.service.node}`;
  ensureDockerImage(tasks, baseDir, nodeImage);

  tasks.push({
    title: `Service ${name} - Yarn Install`,
    requires: [
      `docker-image-${nodeImage}`,
      `repo-${name}-exact-source`,
      `repo-${name}-dir`,
    ],
    provides: [
      `service-${name}-installed-app-dir`,
    ],
    locks: ['docker'],
    run: async (requirements, utils) => {
      const repoDir = requirements[`repo-${name}-dir`];
      const appDir = path.join(workDir, 'app');
      const cacheDir = path.join(workDir, 'cache');
      const sources = [requirements[`repo-${name}-exact-source`]];
      const provides = {
        [`service-${name}-installed-app-dir`]: appDir,
      };

      if (dirStamped({dir: appDir, sources})) {
        return utils.skip({provides});
      }
      await rimraf(appDir);
      await mkdirp(cacheDir);

      utils.step({title: 'Copy Repository'});

      // copy from the repo (including .git as it is used to get the revision)
      await copy(repoDir, appDir, {dot: true});
      assert(fs.existsSync(appDir));

      utils.step({title: 'Run Yarn Install'});

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

      // Note that we do not run `neutrino build`, as that requires runtime
      // configuration.  Instead, the Dockerfile is set up to run this at
      // deployment time.

      stampDir({dir: appDir, sources});
      return provides;
    },
  });

  tasks.push({
    title: `Service ${name} - Build Image`,
    requires: [
      `repo-${name}-exact-source`,
      `service-${name}-installed-app-dir`,
    ],
    provides: [
      `service-${name}-docker-image`, // docker image tag
      `service-${name}-image-on-registry`, // true if the image already exists on registry
    ],
    locks: ['docker'],
    run: async (requirements, utils) => {
      const appDir = requirements[`service-${name}-installed-app-dir`];
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

      const dockerfile = TOOLS_UI_DOCKERFILE_TEMPLATE({nodeImage});
      const nginxConf = fs.readFileSync(path.join(__dirname, 'tools-ui-nginx-site.conf'));

      const tarball = tar.pack(appDir, {
        finalize: false,
        map: header => {
          header.name = `app/${header.name}`;
          return header;
        },
        finish: pack => {
          pack.entry({name: 'Dockerfile'}, dockerfile);
          pack.entry({name: 'nginx-site.conf'}, nginxConf);
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
