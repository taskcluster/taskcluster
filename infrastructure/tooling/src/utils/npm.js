const util = require('util');
const fs = require('fs');
const path = require('path');
const rimraf = util.promisify(require('rimraf'));
const mkdirp = util.promisify(require('mkdirp'));
const taskcluster = require('taskcluster-client');
const {execCommand} = require('./command');
const {REPO_ROOT} = require('./repo');

/**
 * Perform an `npm publish`
 *
 * - dir -- directory to publish from
 * - apiToken -- npm API token
 * - logfile -- name of the file to write the log to
 * - utils -- taskgraph utils (waitFor, etc.)
 */
exports.npmPublish = async ({dir, apiToken, logfile, utils}) => {
  // override HOME so this doesn't use the user's npm token
  const homeDir = path.join(REPO_ROOT, 'temp', taskcluster.slugid());
  const npmrc = path.join(dir, '.npmrc');

  if (!apiToken) {
    throw new Error("No NPM apiToken provided");
  }

  try {
    await mkdirp(homeDir);

    // it's not really clear which registry npm uses, so we
    // just add the token to both of them..
    fs.writeFileSync(npmrc,
      `//registry.yarnpkg.com/:_authToken=${apiToken}\n` +
      `//registry.npmjs.org/:_authToken=${apiToken}\n`);

    await execCommand({
      dir,
      command: ['npm', 'publish'],
      utils,
      logfile,
      env: {
        ...process.env,
        HOME: homeDir,
      },
    });
  } finally {
    await rimraf(homeDir);
    await rimraf(npmrc);
  }
};
