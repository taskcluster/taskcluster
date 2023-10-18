import util from 'util';
import fs from 'fs';
import path from 'path';
import mkdirp from 'mkdirp';
import taskcluster from 'taskcluster-client';
import { execCommand } from './command.js';
import { REPO_ROOT } from './repo.js';
import * as _rimraf from 'rimraf';
const rimraf = util.promisify(_rimraf.default);

/**
 * Perform an `npm publish`
 *
 * - dir -- directory to publish from
 * - apiToken -- npm API token
 * - logfile -- name of the file to write the log to
 * - utils -- taskgraph utils (waitFor, etc.)
 */
export const npmPublish = async ({ dir, apiToken, logfile, utils }) => {
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
      `//registry.npmjs.org/:_authToken=${apiToken}\n` +
      // set unsafe-perm since we run as root when publishing
      'unsafe-perm=true\n');

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
