import path from 'path';
import cronstrue from 'cronstrue';
import { markdownTable } from 'markdown-table';
import { listServices, modifyRepoFile } from '../../utils/index.js';

const SERVICES = listServices();

const serviceDocType = {
  auth: 'platform',
  object: 'platform',
  queue: 'platform',
  github: 'integrations',
  hooks: 'core',
  index: 'core',
  notify: 'core',
  'purge-cache': 'core',
  secrets: 'core',
  'web-server': 'core',
  'worker-manager': 'core',
};

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
        `$1\n${markdownTable(res)}\n$2`));
  },
});

tasks.push({
  title: `Generate Metrics Table`,
  requires: SERVICES.map(name => `procs-${name}`),
  provides: [],
  run: async (requirements, utils) => {
    let res = [['Service', 'Name', 'Type', 'Reference']];
    SERVICES.forEach(name => {
      const procs = requirements[`procs-${name}`];
      Object.entries(procs).filter(([_, { metrics }]) => !!metrics).forEach(([proc, ext]) => {
        res.push([
          name,
          proc,
          ext.type,
          `[reference](/docs/reference/${serviceDocType[name]}/${name}/metrics)`,
        ]);
      });
    });

    const docFile = path.join('ui', 'docs', 'manual', 'deploying', 'monitoring.mdx');
    await modifyRepoFile(docFile,
      content => content.replace(
        /(<!-- BEGIN METRICS TABLE -->)(?:.|\n)*(<!-- END METRICS TABLE -->)/m,
        `$1\n${markdownTable(res)}\n$2`));
  },
});
