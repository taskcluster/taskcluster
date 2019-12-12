const util = require('util');
const chalk = require('chalk');
const path = require('path');
const {Database, Schema} = require('taskcluster-lib-postgres');

const main = async () => {
  const dbUrl = process.env.ADMIN_DB_URL;
  if (!dbUrl) {
    throw new Error('$ADMIN_DB_URL is not set');
  }
  const schema = Schema.fromDbDirectory(path.join(__dirname, '../../../db'));

  const showProgress = message => {
    util.log(chalk.green(message));
  };

  await Database.upgrade({
    schema,
    showProgress,
    readDbUrl: dbUrl,
    writeDbUrl: dbUrl,
  });
};

main().catch(err => {
  console.log(err);
  process.exit(1);
});
