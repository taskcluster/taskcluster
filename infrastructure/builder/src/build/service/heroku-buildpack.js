const util = require('util');
const fs = require('fs');
const path = require('path');
const rimraf = util.promisify(require('rimraf'));
const mkdirp = util.promisify(require('mkdirp'));
const doT = require('dot');
const {quote} = require('shell-quote');
const tar = require('tar-fs');
const copy = require('recursive-copy');
const Stamp = require('../stamp');
const {gitClone, dockerRun, dockerPull, dockerImages, dockerBuild, dockerRegistryCheck,
  serviceDockerImageTask, ensureDockerImage, ensureTask} = require('../utils');

doT.templateSettings.strip = false;
const ENTRYPOINT_TEMPLATE = doT.template(fs.readFileSync(path.join(__dirname, 'entrypoint.dot')));
const HEROKU_DOCKERFILE_TEMPLATE = doT.template(fs.readFileSync(path.join(__dirname, 'heroku-dockerfile.dot')));

exports.herokuBuildpackTasks = ({tasks, baseDir, spec, cfg, name, cmdOptions, repository, workDir}) => {
  const isMonorepo = repository.source === 'monorepo';
  const stackImage = `heroku/${repository.service.stack.replace('-', ':')}`;
  const buildImage = `heroku/${repository.service.stack.replace('-', ':')}-build`;
  const buildpackUrl = repository.service.buildpack;
  const buildpackName = buildpackUrl.startsWith('https://github.com/heroku/') ?
    buildpackUrl.split('/')[4] : buildpackUrl.replace('/', '_');

  ensureDockerImage(tasks, baseDir, stackImage);
  ensureDockerImage(tasks, baseDir, buildImage);

  const [repoDirName, repoExactSourceName, repoStampName] = isMonorepo ? [
    'monorepo-dir',
    'monorepo-exact-source',
    'monorepo-stamp',
  ] : [
    `repo-${name}-dir`,
    `repo-${name}-exact-source`,
    `repo-${name}-stamp`,
  ];

  ensureTask(tasks, {
    title: `Clone ${buildpackName}`,
    requires: [],
    provides: [
      `repo-${buildpackName}-dir`,
      `repo-${buildpackName}-exact-source`,
      `repo-${buildpackName}-stamp`,
    ],
    run: async (requirements, utils) => {
      const repoDir = path.join(baseDir, `repo-${buildpackName}-dir`);
      const {exactRev, changed} = await gitClone({
        dir: repoDir,
        url: buildpackUrl,
        utils,
      });

      const [repoUrl] = buildpackUrl.split('#');
      const stamp = new Stamp({step: 'buildpack-clone', version: 1},
        `${repoUrl}#${exactRev}`);
      const provides = {
        [`repo-${buildpackName}-dir`]: repoDir,
        [`repo-${buildpackName}-exact-source`]: `${repoUrl}#${exactRev}`,
        [`repo-${buildpackName}-stamp`]: stamp,
      };

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
      repoDirName,
      repoExactSourceName,
      repoStampName,
      `docker-image-${buildImage}`,
      `repo-${buildpackName}-dir`,
      `repo-${buildpackName}-stamp`,
    ],
    provides: [
      `service-${name}-built-app-dir`,
      `service-${name}-stamp`,
    ],
    locks: ['docker'],
    run: async (requirements, utils) => {
      const repoDir = requirements[repoDirName];
      const appDir = path.join(workDir, 'app');
      const bpDir = requirements[`repo-${buildpackName}-dir`];
      const revision = requirements[repoExactSourceName].split('#')[1];

      const stamp = new Stamp({step: 'service-compile', version: 1},
        requirements[`repo-${buildpackName}-stamp`],
        requirements[repoStampName]);
      const provides = {
        [`service-${name}-built-app-dir`]: appDir,
        [`service-${name}-stamp`]: stamp,
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

      const procfilePath = isMonorepo ?
        path.join(appDir, 'services', name, 'Procfile') :
        path.join(appDir, 'Procfile');
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

      stamp.stampDir(appDir);
      return provides;
    },
  });

  serviceDockerImageTask({tasks, baseDir, workDir, cfg, name,
    requires: [
      `service-${name}-stamp`,
      `service-${name}-built-app-dir`,
      `docker-image-${stackImage}`,
    ],
    makeTarball: (requirements, utils) => {
      const appDir = requirements[`service-${name}-built-app-dir`];
      const dockerfile = HEROKU_DOCKERFILE_TEMPLATE({stackImage});
      fs.writeFileSync(path.join(workDir, 'Dockerfile'), dockerfile);

      const appGitDir = path.join(appDir, '.git');
      return tar.pack(workDir, {
        entries: ['app', 'Dockerfile'],
        ignore: fulname => name.startsWith(appGitDir),
      });
    },
  });

  if (repository.docs === 'generated') {
    tasks.push({
      title: `Service ${name} - Generate Docs`,
      requires: [
        `service-${name}-built-app-dir`,
        `service-${name}-stamp`,
        `docker-image-${stackImage}`,
      ],
      provides: [
        `docs-${name}-dir`,
        `docs-${name}-stamp`,
      ],
      locks: ['docker'],
      run: async (requirements, utils) => {
        const appDir = requirements[`service-${name}-built-app-dir`];
        // note that docs directory paths must have this form (${basedir}/docs is
        // mounted in docker images)
        const docsDir = path.join(baseDir, 'docs', name);

        const stamp = new Stamp({step: 'service-docs', version: 1},
          requirements[`service-${name}-stamp`]);
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

        stamp.stampDir(docsDir);
        return provides;
      },
    });
  }
};
