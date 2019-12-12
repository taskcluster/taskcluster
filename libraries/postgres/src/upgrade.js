const path = require('path');
const {Database, Schema} = require('..');

const main = async () => {
  const dbUrl = process.env.WRITE_DB_URL;
  const schema = Schema.fromDbDirectory(path.join(__dirname, '../../../db'));

  Database.upgrade({
    schema,
    readDbUrl: dbUrl,
    writeDbUrl: dbUrl,
  });
};

main().catch(err => {
  console.log(err);
  process.exit(1);
});
