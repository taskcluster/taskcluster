import chalk from 'chalk';
import { upgrade, downgrade } from './upgrade.js';
import { renumberVersions, newVersion } from './versions.js';

const main = async () => {
  const adminDbUrl = process.env.ADMIN_DB_URL;
  if (!adminDbUrl) {
    throw new Error('$ADMIN_DB_URL is not set');
  }

  const usernamePrefix = process.env.USERNAME_PREFIX;
  if (!usernamePrefix) {
    throw new Error('$USERNAME_PREFIX is not set');
  }

  /** @param {string} message */
  const showProgress = message => {
    console.log(chalk.green(message));
  };

  const toVersion = process.argv[3] ? parseInt(process.argv[3], 10) : undefined;
  if (toVersion !== undefined && (!process.argv[3].match(/^[0-9]+$/) || isNaN(toVersion))) {
    throw new Error('invalid db version specified -- must be an integer DB version, not a TC release version');
  }

  switch (process.argv[2]) {
    case 'upgrade':
      await upgrade({ showProgress, adminDbUrl, usernamePrefix, toVersion: toVersion });
      break;
    case 'downgrade':
      if (!toVersion) {
        throw new Error('must specify a version to downgrade to');
      }
      await downgrade({ showProgress, adminDbUrl, usernamePrefix, toVersion: toVersion });
      break;
    case 'renumber':
      if (process.argv.length !== 5) {
        throw new Error('usage: node db/src/main.js renumber <from> <to>');
      }
      if (!toVersion) {
        throw new Error('must specify a version to renumber to');
      }
      await renumberVersions(toVersion, parseInt(process.argv[4], 10));
      break;
    case 'new':
      await newVersion();
      break;
    default:
      throw new Error('invalid subcommand for db/src/main.js');
  }

};

main().catch(err => {
  console.log(err);
  process.exit(1);
});
