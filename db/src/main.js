const util = require('util');
const chalk = require('chalk');
const {upgrade} = require('taskcluster-db');

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

  await upgrade({showProgress, adminDbUrl, usernamePrefix});
};

main().catch(err => {
  console.log(err);
  process.exit(1);
});
