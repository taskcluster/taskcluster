const util = require('util');
const chalk = require('chalk');
const { upgrade, downgrade } = require('taskcluster-db');

const main = async () => {
  const adminDbUrl = process.env.ADMIN_DB_URL;
  if (!adminDbUrl) {
    throw new Error('$ADMIN_DB_URL is not set');
  }

  const usernamePrefix = process.env.USERNAME_PREFIX;
  if (!usernamePrefix) {
    throw new Error('$USERNAME_PREFIX is not set');
  }

  const showProgress = message => {
    util.log(chalk.green(message));
  };

  const toVersion = process.argv[3] ? parseInt(process.argv[3]) : undefined;
  if (toVersion !== undefined && (!process.argv[3].match(/^[0-9]+$/) || isNaN(toVersion))) {
    throw new Error('invalid db version specified -- must be an integer DB version, not a TC release version');
  }

  if (process.argv[2] === 'upgrade') {
    await upgrade({ showProgress, adminDbUrl, usernamePrefix, toVersion });
  } else if (process.argv[2] === 'downgrade') {
    if (!toVersion) {
      throw new Error('must specify a version to downgrade to');
    }
    await downgrade({ showProgress, adminDbUrl, usernamePrefix, toVersion });
  } else {
    throw new Error('invalid subcommand for db/src/main.js');
  }
};

main().catch(err => {
  console.log(err);
  process.exit(1);
});
