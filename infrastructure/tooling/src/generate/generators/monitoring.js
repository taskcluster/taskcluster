import path from 'path';
import cronstrue from 'cronstrue';
import table from 'markdown-table';
import { listServices, modifyRepoFile } from '../../utils/index.js';

const SERVICES = listServices();

export const tasks = [];

SERVICES.forEach(name => {
  tasks.push({
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

      return { [`monitoring-hints-${name}`]: res };
    },
  });
});

tasks.push({
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
      content => content.replace(
        /(-- BEGIN MONITORING TABLE -->)(?:.|\n)*(<!-- END MONITORING TABLE --)/m,
        `$1\n${table(res)}\n$2`));
  },
});
