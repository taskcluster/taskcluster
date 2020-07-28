const { Schema } = require('taskcluster-lib-postgres');
const { getDbReleases, updateVersionsReadme } = require('../../utils');

exports.tasks = [{
  title: '`db/versions/README`',
  requires: ['db-schema-serializable'],
  provides: ['db-versions-readme'],
  run: async (requirements, utils) => {
    const schema = Schema.fromSerializable(requirements['db-schema-serializable']);
    const releases = await getDbReleases();
    await updateVersionsReadme(schema, releases);
  },
}];
