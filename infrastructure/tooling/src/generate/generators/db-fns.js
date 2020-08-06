const { Schema } = require('taskcluster-lib-postgres');
const { getDbReleases, updateDbFns, readRepoJSON } = require('../../utils');

exports.tasks = [{
  title: 'README DB Functions',
  requires: ['db-schema-serializable'],
  provides: ['db-fns-readme'],
  run: async (requirements, utils) => {
    const currentTcVersion = (await readRepoJSON('package.json')).version;
    const schema = Schema.fromSerializable(requirements['db-schema-serializable']);
    const releases = await getDbReleases();
    await updateDbFns(schema, releases, currentTcVersion);
  },
}];
