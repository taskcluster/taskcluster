const { Schema } = require('taskcluster-lib-postgres');
const stringify = require('json-stable-stringify');
const { writeRepoJSON } = require('../../utils');
// Generate a readable JSON version of the schema.
exports.tasks = [{
  title: 'DB Schema',
  requires: [],
  provides: ['schema-json'],
  run: async (requirements, utils) => {
    const schema = Schema.fromDbDirectory();

    writeRepoJSON('generated/db-schema.json', JSON.parse(schema.asSerializable()));
  },
}];
