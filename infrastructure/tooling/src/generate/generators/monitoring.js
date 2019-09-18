const path = require('path');
const cronstrue = require('cronstrue');
const table = require('markdown-table');
const {listServices, modifyRepoFile} = require('../../utils');

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

    const docFile = path.join('ui', 'docs', 'manual', 'deploying', 'monitoring.mdx');
    await modifyRepoFile(docFile,
      content => content.replace(/(<!-- GENERATED; DO NOT EDIT -->).*/ms, `$1\n${table(res)}`));
  },
});
