const path = require('path');
const cronstrue = require('cronstrue');
const table = require('markdown-table');
const {listServices, writeRepoFile} = require('../../utils');

const SERVICES = listServices();

exports.tasks = [];

SERVICES.forEach(name => {
  exports.tasks.push({
    title: `Generate Monitoring Hints for ${name}`,
    requires: [
      `procs-${name}`,
    ],
    provides: [`monitoring-hints-${name}`],
    run: async (requirements, utils) => {
      const res = [];
      Object.entries(requirements[`procs-${name}`]).forEach(([proc, ext]) => {
        if (ext.type === 'cron') {
          res.push([name, proc, `taskcluster.${name}`, ext.deadline, cronstrue.toString(ext.schedule)]);
        }
        if (ext.type === 'background' && ext.subType === 'iterate') {
          res.push([name, proc, `taskcluster.${name}`, 'continuous', 'continuous']);
        }
      });

      return {[`monitoring-hints-${name}`]: res};
    },
  });
});

exports.tasks.push({
  title: `Generate Monitoring Suggestions`,
  requires: SERVICES.map(name => `monitoring-hints-${name}`),
  provides: [],
  run: async (requirements, utils) => {
    let res = [['Service', 'Name', 'Logger', 'Deadline (seconds)', 'Schedule']];
    SERVICES.forEach(name => {
      res = res.concat(requirements[`monitoring-hints-${name}`]);
    });

    const doc = `
<!-- GENERATED DOCUMENTATION DO NOT EDIT -->
# Monitoring Suggestions

Taskcluster has several background processes that you should ensure are running on a schedule. Any of the following will generate messages
of the form:

\`\`\`json
{
  "Type": "monitor.periodic",
  "Logger": "<Logger>",
  "Fields": {
    "name": "<Name>"
  }
}
\`\`\`

They will also have Fields for \`status\`, \`duration\`, and a serialized \`error\` if an error occured.

The processes that have \`continuous\` for their dedaline and schedule run every few minutes and should complete fairly quickly. The rest
have their schedules and maximum allowed duration defined here. All times are relative to the timezone of the k8s master.

${table(res)}
    `.trim();

    await writeRepoFile(path.join('dev-docs', 'monitoring-suggestions.md'), doc);
  },
});
