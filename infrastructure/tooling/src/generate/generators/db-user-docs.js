const path = require('path');
const { Schema } = require('taskcluster-lib-postgres');
const {readRepoFile, writeRepoFile, REPO_ROOT} = require('../../utils');

exports.tasks = [{
  title: 'Users in DB Deployment Docs',
  requires: ['db-schema-serializable'],
  provides: [],
  run: async (requirements, utils) => {
    const schema = Schema.fromDbDirectory(path.join(REPO_ROOT, 'db'));
    const services = Object.keys(schema.access).sort();

    const docsFile = path.join('ui', 'docs', 'manual', 'deploying', 'database.mdx');
    const content = await readRepoFile(docsFile);
    const adminUser = ` * \`<prefix>\` -- admin user`;
    const serviceUsers = services
      .map(s => ` * \`<prefix>_taskcluster_${s}\` -- user for Taskcluster ${s} service`)
      .join('\n');
    const newContent = content.replace(
      /(<!-- USERLIST BEGIN -->)(?:.|\n)*(<!-- USERLIST END -->)/m,
      `$1\n${adminUser}\n${serviceUsers}\n$2`);

    if (content !== newContent) {
      await writeRepoFile(docsFile, newContent);
    }
  },
}];
