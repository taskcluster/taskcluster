const fs = require('fs');
const glob = require('glob');
const path = require('path');
const {
  ensureTask,
  execCommand,
  dockerPush,
  REPO_ROOT,
} = require('../../utils');

module.exports = ({tasks, cmdOptions, credentials, baseDir, logsDir}) => {
  ensureTask(tasks, {
    title: 'Build livelog artifacts',
    requires: ['clean-artifacts-dir'],
    provides: ['livelog-artifacts'],
    run: async (requirements, utils) => {
      const artifactsDir = requirements['clean-artifacts-dir'];

      await execCommand({
        dir: path.join(REPO_ROOT, 'tools', 'livelog'),
        command: ['./build.sh', artifactsDir],
        utils,
      });

      const artifacts = glob.sync('livelog-*', {cwd: artifactsDir});

      return {
        'livelog-artifacts': artifacts,
      };
    },
  });

  ensureTask(tasks, {
    title: 'Build livelog Docker Image',
    requires: [
      'release-version',
      'docker-flow-version',
    ],
    provides: [
      'livelog-docker-image', // image tag
    ],
    locks: ['docker'],
    run: async (requirements, utils) => {
      utils.step({title: 'Check Repository'});

      const tag = `taskcluster/livelog:${requirements['release-version']}`;
      const provides = {
        'livelog-docker-image': tag,
      };

      utils.step({title: 'Building Livelog'});

      const contextDir = path.join(baseDir, 'livelog-build');
      await execCommand({
        command: [
          'go', 'build',
          '-o', path.join(contextDir, 'livelog'),
          './tools/livelog',
        ],
        dir: REPO_ROOT,
        logfile: path.join(logsDir, 'livelog-build.log'),
        utils,
        env: {CGO_ENABLED: '0', ...process.env},
      });

      utils.step({title: 'Building Docker Image'});

      fs.writeFileSync(
        path.join(contextDir, 'version.json'),
        requirements['docker-flow-version']);

      // this simple Dockerfile just packages the binary into a Docker image
      const dockerfile = path.join(contextDir, 'Dockerfile');
      fs.writeFileSync(dockerfile, [
        'FROM scratch',
        'EXPOSE 60023',
        'EXPOSE 60022',
        'COPY version.json /app/version.json',
        'COPY livelog /livelog',
        'ENTRYPOINT ["/livelog"]',
      ].join('\n'));
      let command = [
        'docker', 'build',
        '--no-cache',
        '--progress', 'plain',
        '--tag', tag,
        contextDir,
      ];
      await execCommand({
        command,
        dir: REPO_ROOT,
        logfile: path.join(logsDir, 'livelog-docker-build.log'),
        utils,
        env: {DOCKER_BUILDKIT: 1, ...process.env},
      });

      if (cmdOptions.staging || !cmdOptions.push) {
        return provides;
      }

      utils.step({title: 'Pushing Docker Image'});

      const dockerPushOptions = {};
      if (credentials.dockerUsername && credentials.dockerPassword) {
        dockerPushOptions.credentials = {
          username: credentials.dockerUsername,
          password: credentials.dockerPassword,
        };
      }

      await dockerPush({
        logfile: path.join(logsDir, 'livelog-docker-push.log'),
        tag,
        utils,
        baseDir,
        ...dockerPushOptions,
      });

      return provides;
    },
  });

  ensureTask(tasks, {
    title: 'Livelog Build Complete',
    requires: [
      'clean-artifacts-dir',
      'livelog-artifacts',
      'livelog-docker-image',
    ],
    provides: [
      'target-livelog',
    ],
    run: async (requirements, utils) => {
      const artifactsDir = requirements['clean-artifacts-dir'];
      return {
        'target-livelog': [
          'Livelog artifacts:',
          ...requirements['livelog-artifacts'].map(a => ` - ${artifactsDir}/${a}`),
          `Livelog docker image: ${requirements['livelog-docker-image']}`,
        ].join('\n'),
      };
    },
  });
};
