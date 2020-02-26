const { snakeCase } = require('change-case');

exports.fail = msg => {
  console.error(msg);
  process.exit(1);
};

exports.azurePostgresTableNameMapping = azureTableName =>
  `${snakeCase(azureTableName)}_entities`;
