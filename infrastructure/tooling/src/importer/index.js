const { Monitor } = require('./monitor');
const { Operations } = require('./operations');
const { Config } = require('./config');
const { createOperations } = require('./importer');

const main = async () => {
  const monitor = new Monitor();
  const config = new Config({monitor, order: 1});
  const operations = new Operations({monitor, config, order: 5});

  await createOperations({operations, config, monitor});

  await operations.runAll();

  process.exit(0);
};

module.exports = {
  importer: main,
};
