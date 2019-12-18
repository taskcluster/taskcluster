const { Schema } = require('taskcluster-lib-postgres');
const sortObject = require('deep-sort-object');
const { writeRepoJSON } = require('../../utils');
// Generate a readable JSON version of the schema.
exports.tasks = [{
  title: 'Schema JSON',
  requires: [],
  provides: ['schema-json'],
  run: async (requirements, utils) => {
    const schema = Schema.fromDbDirectory();

    writeRepoJSON('generated/schema.json', sortObject({
      versions: schema.versions,
      access: schema.access,
    }, null, 2));
  },
}];
