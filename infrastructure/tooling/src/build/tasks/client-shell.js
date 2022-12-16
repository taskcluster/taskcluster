const path = require('path');
const {
  ensureTask,
  execCommand,
  REPO_ROOT,
} = require('../../utils');

module.exports = ({ tasks, cmdOptions, credentials, baseDir, logsDir }) => {
  ensureTask(tasks, {
    title: 'Build client-shell artifacts',
    requires: ['clean-artifacts-dir'],
    provides: ['client-shell-artifacts'],
    run: async (requirements, utils) => {
      const artifactsDir = requirements['clean-artifacts-dir'];
      await execCommand({
        dir: artifactsDir,
        command: ['go', 'install', 'github.com/goreleaser/goreleaser@latest'],
        utils,
      });

      let goreleaserCmd = [
        'goreleaser',
        'release',
        '--rm-dist',
      ];

      if (cmdOptions.staging || !cmdOptions.push) {
        // --snapshot will generate an unversioned snapshot release,
        // skipping all validations and without publishing any artifacts
        goreleaserCmd = goreleaserCmd.push('--snapshot');
      }

      await execCommand({
        dir: REPO_ROOT,
        command: goreleaserCmd,
        utils,
      });

      await execCommand({
        dir: path.join(REPO_ROOT, 'dist'),
        command: [
          'mv',
          'taskcluster-darwin-amd64.tar.gz',
          'taskcluster-darwin-arm64.tar.gz',
          'taskcluster-linux-amd64.tar.gz',
          'taskcluster-linux-arm64.tar.gz',
          'taskcluster-windows-amd64.zip',
          'taskcluster-windows-arm64.zip',
          artifactsDir,
        ],
        utils,
      });

      const osarch = 'linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64';
      const artifacts = osarch.split(' ')
        .map(osarch => {
          const [os, arch] = osarch.split('/');
          if (os === 'windows') {
            return `taskcluster-${os}-${arch}.zip`;
          }
          return `taskcluster-${os}-${arch}.tar.gz`;
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
