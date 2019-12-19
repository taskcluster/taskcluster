const path = require('path');
const { Schema } = require('taskcluster-lib-postgres');
const { writeRepoJSON, REPO_ROOT } = require('../../utils');

// Generate a readable JSON version of the schema.
exports.tasks = [{
  title: 'DB Schema',
  requires: [],
  provides: ['schema-json'],
  run: async (requirements, utils) => {
    const schema = Schema.fromDbDirectory(path.join(REPO_ROOT, 'db'));

    writeRepoJSON('generated/db-schema.json', JSON.parse(schema.asSerializable()));
  },
}];
