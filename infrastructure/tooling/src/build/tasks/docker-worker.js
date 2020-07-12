const path = require('path');
const {
  ensureTask,
  readRepoJSON,
  dockerRun,
  dockerPull,
  REPO_ROOT,
} = require('../../utils');

module.exports = ({tasks, cmdOptions, credentials, baseDir, logsDir}) => {
  ensureTask(tasks, {
    title: 'Build docker-worker artifacts',
    requires: ['clean-artifacts-dir'],
    provides: ['docker-worker-artifacts'],
    run: async (requirements, utils) => {
      const artifactsDir = requirements['clean-artifacts-dir'];

      // The docker-worker build currently requires npm packages that must be compiled,
      // and the local system does not have the necessary package installed to do so,
      // so we build the docker-worker image in a docker container.

      utils.step({title: 'Pull Docker Image'});

      const nodeVersion = (await readRepoJSON('package.json')).engines.node;
      const image = 'node:' + nodeVersion;
      await dockerPull({image, utils, baseDir});

      utils.step({title: 'Build Docker-Worker Tarball'});

      await dockerRun({
        baseDir,
        logfile: path.join(logsDir, '/docker-worker-build.log'),
        image,
        mounts: [
          {
            Type: 'bind',
            Source: path.join(REPO_ROOT, 'workers', 'docker-worker'),
            Target: '/src',
            ReadOnly: true,
          }, {
            Type: 'bind',
            Source: artifactsDir,
            Target: '/dst',
            ReadOnly: false,
          },
        ],
        command: ['sh', './release.sh', '-o', '/dst/docker-worker-x64.tgz'],
        workingDir: '/src',
        utils,
      });

      const artifacts = ['docker-worker-x64.tgz'];

      return {
        'docker-worker-artifacts': artifacts,
      };
    },
  });

  ensureTask(tasks, {
    title: 'Docker-Worker Complete',
    requires: [
      'clean-artifacts-dir',
      'docker-worker-artifacts',
    ],
    provides: [
      'target-docker-worker',
    ],
    run: async (requirements, utils) => {
      const artifactsDir = requirements['clean-artifacts-dir'];
      return {
        'target-docker-worker': [
          'Docker-Worker artifacts:',
          ...requirements['docker-worker-artifacts'].map(a => ` - ${artifactsDir}/${a}`),
        ].join('\n'),
      };
    },
  });
};
