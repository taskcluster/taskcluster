const path = require('path');
const cronstrue = require('cronstrue');
const table = require('markdown-table');
const { listServices, modifyRepoFile, writeRepoFile } = require('../../utils');
const TOML = require('@iarna/toml');
const { JSDOM } = require('jsdom');

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

      return { [`monitoring-hints-${name}`]: res };
    },
  });
  exports.tasks.push({
    title: `Generate Telescope Config for ${name}`,
    requires: [
      `procs-${name}`,
    ],
    provides: [`telescope-${name}`],
    run: async (requirements, utils) => {
      const res = [];
      Object.entries(requirements[`procs-${name}`]).forEach(([proc, ext]) => {
        if (ext.type === 'web') {
          res.push([name, proc]);
        }
      });

      return { [`telescope-${name}`]: res };
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
      content => content.replace(
        /(-- BEGIN MONITORING TABLE -->)(?:.|\n)*(<!-- END MONITORING TABLE --)/m,
        `$1\n${table(res)}\n$2`));
  },
});

exports.tasks.push({
  title: `Generate Telescope Example Config`,
  requires: SERVICES.map(name => `telescope-${name}`),
  provides: ['telescope-config'],
  run: async (requirements, utils) => {
    const exampleBaseUrl = 'EXAMPLE.COM';
    let res = { checks: { taskcluster: {} } };
    SERVICES.forEach(name => {
      requirements[`telescope-${name}`].forEach(([svc, proc]) => {
        res.checks.taskcluster[`${name}-heartbeat`] = {
          description: `${name} service is alive`,
          module: 'checks.core.heartbeat',
          ttl: 60,
          'params.url': `https://${exampleBaseUrl}/api/${name}/v1/ping`,
        };
      });
    });

    const docFile = path.join('ui', 'docs', 'manual', 'deploying', 'monitoring.mdx');
    await modifyRepoFile(docFile,
      content => content.replace(
        /(-- BEGIN POUCAVE CONFIG -->)(?:.|\n)*(<!-- END POUCAVE CONFIG --)/m,
        `$1\n\`\`\`toml\n${TOML.stringify(res)}\n\`\`\`\n$2`));
  },
});

exports.tasks.push({
  title: `Generate Telescope Image`,
  requires: SERVICES.map(name => `telescope-${name}`),
  provides: ['telescope-image'],
  run: async (requirements, utils) => {
    const d3 = await import('d3'); // We import here because it has to be an async dynamic import
    const DAG = require('d3-dag');

    const dependencies = [{ id: 'postgres', parentIds: [] }, { id: 'rabbitmq', parentIds: [] }];

    SERVICES.forEach(name => {
      requirements[`telescope-${name}`].forEach(([svc, proc]) => {
        if (proc === 'web') {
          dependencies.push({
            id: svc,
            parentIds: svc === 'auth' ? ['postgres', 'rabbitmq'] : ['auth', 'postgres', 'rabbitmq'],
          });
        }
      });
    });

    const dag = DAG.dagStratify()(dependencies);
    const layout = DAG
      .sugiyama()
      .nodeSize((node) => [400, 400]);
    const { width, height } = layout(dag);

    const doc = new JSDOM().window.document;
    const svg = d3.select(doc.body)
      .append('svg')
      .attr('viewBox', [0, 0, width, height].join(" "))
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('xmlns', d3.namespaces.svg);

    const nodes = svg
      .append('g')
      .selectAll('g')
      .data(dag.descendants())
      .enter()
      .append('g')
      .attr('transform', ({ x, y }) => `translate(${x}, ${y})`);

    nodes
      .append('circle')
      .attr('r', 200)
      .attr('fill', '#444');

    nodes
      .append('text')
      .text(d => d.data.id)
      .attr('font-weight', 'bold')
      .attr('font-family', 'sans-serif')
      .attr('text-anchor', 'middle')
      .attr('alignment-baseline', 'middle')
      .attr('font-size', '10em')
      .attr('fill', '#fff');

    const line = d3
      .line()
      .curve(d3.curveCatmullRom)
      .x(d => d.x)
      .y(d => d.y);

    svg
      .append('g')
      .selectAll('path')
      .data(dag.links())
      .enter()
      .append('path')
      .attr('d', ({ points }) => line(points))
      .attr('fill', 'none')
      .attr('stroke', '#444')
      .attr('stroke-width', 10);

    const docFile = path.join('ui', 'docs', 'manual', 'deploying', 'telescope-diagram.svg');
    await writeRepoFile(docFile, doc.body.innerHTML);
  },
});
