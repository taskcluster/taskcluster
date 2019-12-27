const path = require('path');
const { Schema } = require('taskcluster-lib-postgres');
const { writeRepoJSON, REPO_ROOT } = require('../../utils');

// Generate a readable JSON version of the schema.
exports.tasks = [{
  title: 'DB Schema',
  requires: [],
  provides: ['db-schema-serializable'],
  run: async (requirements, utils) => {
    const schema = Schema.fromDbDirectory(path.join(REPO_ROOT, 'db'));

    const serializable = schema.asSerializable();
    writeRepoJSON('generated/db-schema.json', serializable);

    return {
      'db-schema-serializable': serializable,
    };
  },
}];
