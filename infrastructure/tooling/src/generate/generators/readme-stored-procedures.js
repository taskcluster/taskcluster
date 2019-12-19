const path = require('path');
const { Schema } = require('taskcluster-lib-postgres');
const {readRepoFile, writeRepoFile, REPO_ROOT} = require('../../utils');

exports.tasks = [{
  title: 'README Stored Procedures',
  provides: ['readme-stored-procedures'],
  run: async (requirements, utils) => {
    const schema = Schema.fromDbDirectory(path.join(REPO_ROOT, 'db'));
    const methods = schema.allMethods();
    const serviceNames = [...new Set([...methods].map(({ serviceName }) => serviceName).sort())];
    const services = new Map();

    serviceNames.forEach(sn => {
      const serviceMethods = [...methods].reduce((acc, method) => {
        if (method.serviceName !== sn) {
          return acc;
        }

        return acc.concat(method);
      }, []);

      services.set(sn, serviceMethods.sort((a, b) => a.name.localeCompare(b.name)));
    });

    const sections = [...services.entries()].map(([serviceName, methods]) => {
      return [
        `### ${serviceName}`,
        '',
        '| Name | Mode | Arguments | Returns | Description |',
        '| --- | --- | --- | --- | --- |',
        ...[...methods.map(method => `| ${method.name} | ${method.mode} | ${method.args} | ${method.returns} | ${method.description.replace(/\n/g, '<br />')} |`)],
      ].join('\n');
    });

    if (sections.length > 0) {
      const content = await readRepoFile(path.join('db', 'README.md'));
      const newContent = content.replace(
        /(<!-- SP BEGIN -->)(?:.|\n)*(<!-- SP END -->)/m,
        `$1\n${sections.join('\n')}\n$2`);

      if (content !== newContent) {
        await writeRepoFile(path.join('db', 'README.md'), newContent);
      }
    }
  },
}];
