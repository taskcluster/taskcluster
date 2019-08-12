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
          res.push([name, proc, `taskcluster.${name}`, 'TODO', ext.deadline, cronstrue.toString(ext.schedule)]);
        }
        if (ext.type === 'background') {
          res.push([name, proc, `taskcluster.${name}`, 'TODO', 'continuous', 'continuous']);
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
    let res = [['Service', 'Proc', 'Logger', 'Type', 'Deadline (seconds)', 'Schedule']];
    SERVICES.forEach(name => {
      res = res.concat(requirements[`monitoring-hints-${name}`]);
    });

    const doc = `
# Monitoring Suggestions

Taskcluster has several background processes that you should ensure are running.

${table(res)}
    `.trim();

    await writeRepoFile(path.join('dev-docs', 'monitoring-suggestions.md'), doc);
  },
});
