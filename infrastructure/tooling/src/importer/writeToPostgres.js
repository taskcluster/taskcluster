const requireFromString = require('require-from-string');
const data = require('./data');
const { rewriteScript } = require('./util');

const writeToPostgres = async (tableName, entities, db, utils) => {
  // TODO: Remove this
  if (tableName !== 'Clients') {
    return;
  }

  const content = await rewriteScript(data[tableName].path);
  const configuredClients = requireFromString(content);

  function setupClient(configuredClient) {
    // const opts = { tableName, db, serviceName: data[tableName].serviceName };
    // return configuredClient.setup(opts)
  }

  if (typeof configuredClients !== 'function') {
    Object.values(configuredClients).forEach(setupClient);
  } else {
    setupClient(configuredClients);
  }

  entities.forEach(entity => {
    // Write entity to db
  });
};

module.exports = writeToPostgres;
