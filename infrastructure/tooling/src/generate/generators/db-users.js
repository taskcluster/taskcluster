const path = require('path');
const { Schema } = require('taskcluster-lib-postgres');
const { readRepoFile, writeRepoFile } = require('../../utils');

exports.tasks = [{
  title: 'Users in DB Deployment Docs',
  requires: ['db-schema-serializable'],
  provides: [],
  run: async (requirements, utils) => {
    const schema = Schema.fromSerializable(requirements['db-schema-serializable']);
    const services = schema.access.serviceNames().sort();

    const docsFile = path.join('ui', 'docs', 'manual', 'deploying', 'database.mdx');
    const content = await readRepoFile(docsFile);
    const adminUser = ` * \`<prefix>\` -- admin user`;
    const serviceUsers = services
      .map(s => ` * \`<prefix>_${s}\` -- user for Taskcluster ${s} service`)
      .join('\n');
    const newContent = content.replace(
      /(<!-- USERLIST BEGIN -->)(?:.|\n)*(<!-- USERLIST END -->)/m,
      `$1\n${adminUser}\n${serviceUsers}\n$2`);

    if (content !== newContent) {
      await writeRepoFile(docsFile, newContent);
    }
  },
}, {
  title: 'Users in db/test-setup.sh',
  requires: ['db-schema-serializable'],
  provides: [],
  run: async (requirements, utils) => {
    const schema = Schema.fromSerializable(requirements['db-schema-serializable']);
    const services = schema.access.serviceNames().sort();

    const setupFile = path.join('db', 'test-setup.sh');
    const content = await readRepoFile(setupFile);
    const serviceCreates = services
      .map(s => `CREATE USER test_${s};`)
      .join('\n');
    const newContent = content.replace(
      /(-- BEGIN CREATE USERS --)(?:.|\n)*(-- END CREATE USERS --)/m,
      `$1\n${serviceCreates}\n$2`);

    if (content !== newContent) {
      await writeRepoFile(setupFile, newContent);
    }
  },
}];
