const glob = require('glob');
const fs = require('fs');
const path = require('path');
const {
  ensureTask,
  execCommand,
  dockerPush,
  REPO_ROOT,
} = require('../../utils');

module.exports = ({tasks, cmdOptions, credentials, baseDir, logsDir}) => {
  ensureTask(tasks, {
    title: 'Build taskcluster-proxy artifacts',
    requires: ['clean-artifacts-dir'],
    provides: ['taskcluster-proxy-artifacts'],
    run: async (requirements, utils) => {
      const artifactsDir = requirements['clean-artifacts-dir'];

      await execCommand({
        dir: path.join(REPO_ROOT, 'tools', 'taskcluster-proxy'),
        command: ['./dockerbuild.sh', artifactsDir],
        utils,
      });

      const artifacts = glob.sync('taskcluster-proxy-*', {cwd: artifactsDir});

      return {
        'taskcluster-proxy-artifacts': artifacts,
      };
    },
  });

  ensureTask(tasks, {
    title: 'Build taskcluster-proxy Docker image',
    requires: ['release-version', 'docker-flow-version'],
    provides: ['taskcluster-proxy-docker-image'],
    locks: ['docker'],
    run: async (requirements, utils) => {
      utils.step({title: 'Check Repository'});

      const tag = `taskcluster/taskcluster-proxy:${requirements['release-version']}`;
      const provides = {'taskcluster-proxy-docker-image': tag};

      utils.step({title: 'Building taskcluster-proxy'});

      const contextDir = path.join(baseDir, 'taskcluster-proxy-build');
      await execCommand({
        command: [
          'go', 'build',
          '-o', path.join(contextDir, 'taskcluster-proxy'),
          './tools/taskcluster-proxy',
        ],
        dir: REPO_ROOT,
        logfile: path.join(logsDir, 'taskcluster-proxy-build.log'),
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
        // get the latest ca-certificates from Ubuntu
        'FROM ubuntu:latest as ubuntu',
        'RUN apt-get update',
        'RUN apt-get install -y ca-certificates',
        // start over in an empty image and just copy the certs in
        'FROM scratch',
        'EXPOSE 80',
        'COPY version.json /app/version.json',
        'COPY taskcluster-proxy /taskcluster-proxy',
        'COPY --from=ubuntu /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt',
        'ENTRYPOINT ["/taskcluster-proxy", "--port", "80"]',
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
        logfile: path.join(logsDir, 'taskcluster-proxy-docker-build.log'),
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
        logfile: path.join(logsDir, 'docker-push.log'),
        tag,
        utils,
        baseDir,
        ...dockerPushOptions,
      });

      return provides;
    },
  });

  ensureTask(tasks, {
    title: 'Taskcluster-Proxy Complete',
    requires: [
      'taskcluster-proxy-artifacts',
      'taskcluster-proxy-docker-image',
    ],
    provides: [
      'target-taskcluster-proxy',
    ],
    run: async (requirements, utils) => {},
  });
};
