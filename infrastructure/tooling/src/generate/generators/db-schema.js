const tcdb = require('taskcluster-db');
const { writeRepoJSON } = require('../../utils');

// Generate a readable JSON version of the schema.
exports.tasks = [{
  title: 'DB Schema',
  requires: [],
  provides: ['db-schema-serializable'],
  run: async (requirements, utils) => {
    const schema = tcdb.schema({ useDbDirectory: true });

    const serializable = schema.asSerializable();
    writeRepoJSON('generated/db-schema.json', serializable);

    return {
      'db-schema-serializable': serializable,
    };
  },
}];
