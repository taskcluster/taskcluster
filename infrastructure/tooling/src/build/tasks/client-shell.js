const path = require('path');
const {
  ensureTask,
  execCommand,
  REPO_ROOT,
} = require('../../utils');

module.exports = ({tasks, cmdOptions, credentials, baseDir, logsDir}) => {
  ensureTask(tasks, {
    title: 'Build client-shell artifacts',
    requires: ['clean-artifacts-dir'],
    provides: ['client-shell-artifacts'],
    run: async (requirements, utils) => {
      const artifactsDir = requirements['clean-artifacts-dir'];
      await execCommand({
        dir: artifactsDir,
        command: ['go', 'get', '-u', 'github.com/mitchellh/gox'],
        utils,
      });

      const osarch = 'linux/amd64 darwin/amd64';
      await execCommand({
        dir: path.join(REPO_ROOT, 'clients', 'client-shell'),
        command: [
          'gox',
          `-osarch=${osarch}`,
          `-output=${artifactsDir}/taskcluster-{{.OS}}-{{.Arch}}`,
        ],
        utils,
      });

      const artifacts = osarch.split(' ')
        .map(osarch => {
          const [os, arch] = osarch.split('/');
          return `taskcluster-${os}-${arch}`;
        });

      return {
        'client-shell-artifacts': artifacts,
      };
    },
  });

  ensureTask(tasks, {
    title: 'Clients Complete',
    requires: [
      'client-shell-artifacts',
    ],
    provides: [
      'target-client-shell',
    ],
    run: async (requirements, utils) => {
      const artifactsDir = requirements['clean-artifacts-dir'];
      return {
        'target-client-shell': [
          'Client-Shell artifacts:',
          ...requirements['client-shell-artifacts'].map(a => ` - ${artifactsDir}/${a}`),
        ].join('\n'),
      };
    },
  });
};
