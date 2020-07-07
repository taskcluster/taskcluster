const {
  ensureTask,
  gitDescribe,
  gitIsDirty,
  dockerFlowVersion,
  REPO_ROOT,
} = require('../utils');

// This file provides release-version and docker-flow-version, either for staging
// or for a real release.

module.exports = ({tasks, cmdOptions, credentials, baseDir, logsDir}) => {
  ensureTask(tasks, {
    title: 'Get local-release version',
    requires: [],
    provides: ['release-version', 'docker-flow-version'],
    run: async (requirements, utils) => {
      // The docker build clones from the current working copy, rather than anything upstream;
      // this avoids the need to land-and-push changes.  This is a git clone
      // operation instead of a raw filesystem copy so that any non-checked-in
      // files are not accidentally built into docker images.  But it does mean that
      // changes need to be checked in.
      if (!cmdOptions.ignoreUncommittedFiles) {
        if (await gitIsDirty({dir: REPO_ROOT})) {
          throw new Error([
            'The current git working copy is not clean. Any non-checked-in files will',
            'not be reflected in the built image, so this is treatd as an error by default.',
            'Either check in the dirty files, or run with --ignore-uncommitted-files to',
            'override this error.  Never check in files containing secrets!',
          ].join(' '));
        }
      }

      const {gitDescription, revision} = await gitDescribe({
        dir: REPO_ROOT,
        utils,
      });

      return {
        'release-version': gitDescription.slice(1),
        'docker-flow-version': dockerFlowVersion({gitDescription, revision}),
      };
    },
  });
};
