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
  serviceDockerImageTask, ensureDockerImage} = require('../utils');

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
      `repo-${name}-stamp`,
      `repo-${name}-dir`,
      ...docNames.map(name => `docs-${name}-dir`),
      ...docNames.map(name => `docs-${name}-stamp`),
    ],
    provides: [
      `service-${name}-built-app-dir`,
      `service-${name}-stamp`,
      `service-${name}-static-dir`, // result of `gulp build-static`
    ],
    locks: ['docker'],
    run: async (requirements, utils) => {
      const repoDir = requirements[`repo-${name}-dir`];
      const appDir = path.join(workDir, 'app');
      const cacheDir = path.join(workDir, 'cache');
      const staticDir = path.join(appDir, 'static');
      const stamp = new Stamp({step: 'docs-build', version: 1},
        // our own repo
        requirements[`repo-${name}-stamp`],
        // all of the input docs
        ...docNames.map(n => requirements[`docs-${n}-stamp`]));
      const provides = {
        [`service-${name}-built-app-dir`]: appDir,
        [`service-${name}-stamp`]: stamp,
        [`service-${name}-static-dir`]: staticDir,
      };

      if (stamp.dirStamped(appDir)) {
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
        logfile: `${workDir}/gulp.log`,
        utils,
        binds: [
          `${appDir}:/app`,
        ],
        baseDir,
      });

      // Streams are wonderful and lead to lots of unhandled promise rejections, meaning that we
      // do not always get a nonzero exit status when the docs build fails.  This is a good
      // double-check:
      if (!fs.existsSync(path.join(staticDir, 'nginx-site.conf'))) {
        throw new Error('`gulp build-static` did not produce static/nginx-site.conf; check the logfile');
      }

      stamp.stampDir(appDir);
      return provides;
    },
  });

  serviceDockerImageTask({tasks, baseDir, workDir, cfg, name,
    requires: [
      `service-${name}-stamp`,
      `service-${name}-static-dir`,
      'docker-image-nginx:alpine',
    ],
    makeTarball: (requirements, utils) => {
      const staticDir = requirements[`service-${name}-static-dir`];
      const dockerfile = DOCS_DOCKERFILE_TEMPLATE({});

      return tar.pack(staticDir, {
        finalize: false,
        finish: pack => {
          pack.entry({name: 'Dockerfile'}, dockerfile);
          pack.finalize();
        },
      });
    },
  });
};

