const util = require('util');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const rimraf = util.promisify(require('rimraf'));
const mkdirp = util.promisify(require('mkdirp'));
const doT = require('dot');
const tar = require('tar-fs');
const copy = require('recursive-copy');
const Stamp = require('../stamp');
const {dockerRun, dockerPull, dockerImages, dockerBuild, dockerRegistryCheck,
  ensureDockerImage, serviceDockerImageTask} = require('../utils');

doT.templateSettings.strip = false;
const TOOLS_UI_DOCKERFILE_TEMPLATE = doT.template(fs.readFileSync(path.join(__dirname, 'tools-ui-dockerfile.dot')));

exports.toolsUiTasks = ({tasks, baseDir, spec, cfg, name, cmdOptions, repository, workDir}) => {
  const nodeImage = `node:${repository.service.node}`;
  ensureDockerImage(tasks, baseDir, nodeImage);

  tasks.push({
    title: `Service ${name} - Yarn Install`,
    requires: [
      `docker-image-${nodeImage}`,
      `repo-${name}-stamp`,
      `repo-${name}-dir`,
    ],
    provides: [
      `service-${name}-installed-app-dir`,
      `service-${name}-stamp`,
    ],
    locks: ['docker'],
    run: async (requirements, utils) => {
      const repoDir = requirements[`repo-${name}-dir`];
      const appDir = path.join(workDir, 'app');
      const cacheDir = path.join(workDir, 'cache');

      const stamp = new Stamp({step: 'service-compile', version: 1},
        requirements[`repo-${name}-stamp`]);
      const provides = {
        [`service-${name}-installed-app-dir`]: appDir,
        [`service-${name}-stamp`]: stamp,
      };

      if (stamp.dirStamped(appDir)) {
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

      stamp.stampDir(appDir);
      return provides;
    },
  });

  serviceDockerImageTask({tasks, baseDir, workDir, cfg, name,
    requires: [
      `service-${name}-installed-app-dir`,
      `docker-image-${nodeImage}`,
    ],
    makeTarball: (requirements, utils) => {
      const appDir = requirements[`service-${name}-installed-app-dir`];
      const dockerfile = TOOLS_UI_DOCKERFILE_TEMPLATE({nodeImage});
      const nginxConf = fs.readFileSync(path.join(__dirname, 'tools-ui-nginx-site.conf'));

      return tar.pack(appDir, {
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
    },
  });
};
