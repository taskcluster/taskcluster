const util = require('util');
const path = require('path');
const rimraf = util.promisify(require('rimraf'));
const mkdirp = util.promisify(require('mkdirp'));
const {ensureTask} = require('../utils');

module.exports = ({tasks, cmdOptions, credentials, baseDir, logsDir}) => {
  const artifactsDir = path.join(baseDir, 'release-artifacts');

  // Clean the artifacts directory and return it
  ensureTask(tasks, {
    title: 'Clean release-artifacts',
    requires: [],
    provides: ['clean-artifacts-dir'],
    run: async (requirements, utils) => {
      await rimraf(artifactsDir);
      await mkdirp(artifactsDir);
      return {'clean-artifacts-dir': artifactsDir};
    },
  });
};
