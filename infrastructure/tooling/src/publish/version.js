const {
  ensureTask,
  gitDescribe,
  dockerFlowVersion,
  REPO_ROOT,
} = require('../utils');

// This file provides release-version and docker-flow-version, either for staging
// or for a real release.

module.exports = ({tasks, cmdOptions, credentials, baseDir, logsDir}) => {
  if (cmdOptions.staging) {
    ensureTask(tasks, {
      title: 'Get staging-release version',
      requires: [],
      provides: ['release-version', 'docker-flow-version'],
      run: async (requirements, utils) => {
        // for staging releases, we get the version from the staging-release/*
        // branch name, and use a fake revision
        const match = /staging-release\/v(\d+\.\d+\.\d+)$/.exec(cmdOptions.staging);
        if (!match) {
          throw new Error(`Staging releases must have branches named 'staging-release/vX.Y.Z'; got ${cmdOptions.staging}`);
        }
        const version = match[1];

        return {
          'release-version': version,
          'docker-flow-version': dockerFlowVersion({
            gitDescription: `v${version}`,
            revision: '9999999999999999999999999999999999999999',
          }),
        };
      },
    });
  } else {
    ensureTask(tasks, {
      title: 'Get release version',
      requires: [],
      provides: ['release-version', 'docker-flow-version'],
      run: async (requirements, utils) => {
        const {gitDescription, revision} = await gitDescribe({
          dir: REPO_ROOT,
          utils,
        });

        if (!gitDescription.match(/^v\d+\.\d+\.\d+$/)) {
          throw new Error(`Can only publish releases from git revisions with tags of the form vX.Y.Z, not ${gitDescription}`);
        }

        return {
          'release-version': gitDescription.slice(1),
          'docker-flow-version': dockerFlowVersion({gitDescription, revision}),
        };
      },
    });
  }
};
