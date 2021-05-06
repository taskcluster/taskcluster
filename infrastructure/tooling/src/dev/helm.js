const { REPO_ROOT, readRepoYAML, execCommand } = require('../utils');
const { TaskGraph } = require('console-taskgraph');

const resourceTypes = [
  'cronjob',
  'deployment',
  'ingress',
  'secret',
  'serviceaccount',
  'service',
];

const actions = [
  {
    title: 'Check dev-config.yml',
    requires: [],
    provides: ['dev-config'],
    run: async (requirements, utils) => {
      const config = await readRepoYAML('dev-config.yml');
      if (!config.meta?.deploymentPrefix) {
        throw new Error('Must have configured dev-config.yml to deploy.');
      }

      if (config.auth && config.auth.static_clients) {
        if (config.auth.static_clients.some(({ clientId, scopes }) => clientId.startsWith('static/taskcluster/') && scopes)) {
          throw new Error('`static/taskcluster/..` clients in auth.static_clients in `dev-config.yml` should not contain scopes');
        }
        if (config.auth.static_clients.some(({ clientId, scopes }) => !clientId.startsWith('static/taskcluster/') && !scopes)) {
          throw new Error('non-taskcluster static clients in auth.static_clients in `dev-config.yml` should scopes');
        }
      }
      return { 'dev-config': config };
    },
  },
  {
    title: 'Helm version detection',
    requires: [],
    provides: ['helm-version'],
    run: async (requirements, utils) => {
      const res = await execCommand({
        command: ['helm', 'version'],
        dir: REPO_ROOT,
        keepAllOutput: true,
        ignoreReturn: true, // Helm 2 yells about tiller
        utils,
      });
      const match = /(SemVer|Version):"(v[0-9]+.[0-9]+.[0-9]+-?[^"]*)"/g.exec(res);
      if (!match) {
        throw new Error(`Could not determine helm version from: ${res}`);
      } else if (match[2].includes('v3')) {
        return { 'helm-version': 3 };
      } else if (match[2].includes('v2')) {
        return { 'helm-version': 2 };
      } else {
        throw new Error(`Must use supported helm version (2 or 3). You have ${match[2]}`);
      }
    },
  },
  {
    title: 'Generate k8s Resources',
    requires: ['dev-config', 'helm-version'],
    provides: ['target-templates'],
    run: async (requirements, utils) => {
      let command = ['helm', 'template'];
      if (requirements['helm-version'] === 2) {
        command.push('-n');
      }
      command = command.concat(['taskcluster', '-f', 'dev-config.yml', 'infrastructure/k8s']);
      return {
        'target-templates': await execCommand({
          command,
          dir: REPO_ROOT,
          keepAllOutput: true,
          utils,
        }),
      };
    },
  },
  {
    title: 'Generate Namespace',
    requires: ['dev-config'],
    provides: ['dev-namespace'],
    run: async (requirements, utils) => {
      const namespace = requirements['dev-config'].meta?.deploymentPrefix;
      await execCommand({
        command: ['kubectl', 'create', 'namespace', namespace],
        dir: REPO_ROOT,
        keepAllOutput: true,
        ignoreReturn: true, // If it already exists, that is fine. we'll fail on switching to namespace
        utils,
      });
      return { 'dev-namespace': namespace };
    },
  },
  {
    title: 'Switch to Namespace',
    requires: ['dev-namespace'],
    provides: ['namespace-switch'],
    run: async (requirements, utils) => {
      await execCommand({
        command: ['kubectl', 'config', 'set-context', '--current', '--namespace', requirements['dev-namespace']],
        dir: REPO_ROOT,
        keepAllOutput: true,
        utils,
      });
    },
  },
  {
    title: 'Verify Your Deployment',
    requires: ['target-templates'],
    provides: ['target-verify'],
    run: async (requirements, utils) => ({
      'target-verify': await execCommand({
        command: ['kubectl', 'apply', '--dry-run', '-f', '-'],
        dir: REPO_ROOT,
        stdin: requirements['target-templates'],
        keepAllOutput: true,
        utils,
      }),
    }),
  },
  {
    title: 'Apply Your Deployment',
    requires: ['target-templates', 'namespace-switch'],
    provides: ['target-apply'],
    run: async (requirements, utils) => ({
      'target-apply': await execCommand({
        command: ['kubectl', 'apply', '--prune', '-l', 'app.kubernetes.io/part-of=taskcluster', '-f', '-'],
        dir: REPO_ROOT,
        stdin: requirements['target-templates'],
        keepAllOutput: true,
        utils,
      }),
    }),
  },
  {
    title: 'Delete Your Deployment',
    requires: ['namespace-switch'],
    provides: ['target-delete'],
    run: async (requirements, utils) => ({
      'target-delete': await execCommand({
        command: ['kubectl', 'delete', resourceTypes.join(','), '-l', 'app.kubernetes.io/part-of=taskcluster'],
        dir: REPO_ROOT,
        keepAllOutput: true,
        utils,
      }),
    }),
  },
];

module.exports = async action => {
  const target = action ? [`target-${action}`] : undefined;
  const taskgraph = new TaskGraph(actions, { target });
  await taskgraph.run();
};
