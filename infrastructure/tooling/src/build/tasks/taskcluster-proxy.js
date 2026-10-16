import { globSync } from 'glob';
import fs from 'node:fs';
import path from 'node:path';
import { ensureTask, execCommand, dockerPush, REPO_ROOT } from '../../utils/index.js';

export default ({ tasks, cmdOptions, credentials, baseDir, logsDir }) => {
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

      const artifacts = globSync('taskcluster-proxy-*', { cwd: artifactsDir });

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
      utils.step({ title: 'Check Repository' });

      const tag = `taskcluster/taskcluster-proxy:v${requirements['release-version']}`;
      const provides = { 'taskcluster-proxy-docker-image': tag };

      utils.step({ title: 'Building taskcluster-proxy' });

      const contextDir = path.join(baseDir, 'taskcluster-proxy-build');
      await execCommand({
        command: ['go', 'build', '-o', path.join(contextDir, 'taskcluster-proxy'), './tools/taskcluster-proxy'],
        dir: REPO_ROOT,
        logfile: path.join(logsDir, 'taskcluster-proxy-build.log'),
        utils,
        env: { CGO_ENABLED: '0', ...process.env },
      });

      utils.step({ title: 'Building Docker Image' });

      fs.writeFileSync(path.join(contextDir, 'version.json'), requirements['docker-flow-version']);

      // the checked-in Dockerfile (also used by the release graph) packages the binary into an image
      fs.copyFileSync(
        path.join(REPO_ROOT, 'infrastructure', 'docker', 'taskcluster-proxy', 'Dockerfile'),
        path.join(contextDir, 'Dockerfile')
      );
      const command = ['docker', 'build', '--no-cache', '--progress', 'plain', '--tag', tag, contextDir];
      await execCommand({
        command,
        dir: REPO_ROOT,
        logfile: path.join(logsDir, 'taskcluster-proxy-docker-build.log'),
        utils,
        env: { DOCKER_BUILDKIT: 1, ...process.env },
      });

      if (!cmdOptions.push) {
        return provides;
      }

      utils.step({ title: 'Pushing Docker Image' });

      const dockerPushOptions = {};
      if (credentials.dockerUsername && credentials.dockerPassword) {
        dockerPushOptions.credentials = {
          username: credentials.dockerUsername,
          password: credentials.dockerPassword,
        };
      }

      await dockerPush({
        logfile: path.join(logsDir, 'taskcluster-proxy-docker-push.log'),
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
    requires: ['clean-artifacts-dir', 'taskcluster-proxy-artifacts', 'taskcluster-proxy-docker-image'],
    provides: ['target-taskcluster-proxy'],
    run: async (requirements, _utils) => {
      const artifactsDir = requirements['clean-artifacts-dir'];
      return {
        'target-taskcluster-proxy': [
          'Taskcluster-Proxy artifacts:',
          ...requirements['taskcluster-proxy-artifacts'].map(a => ` - ${artifactsDir}/${a}`),
          `Taskcluster-Proxy docker image: ${requirements['taskcluster-proxy-docker-image']}`,
        ].join('\n'),
      };
    },
  });
};
