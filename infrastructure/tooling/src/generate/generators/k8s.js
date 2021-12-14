const _ = require('lodash');
const path = require('path');
const glob = require('glob');
const util = require('util');
const yaml = require('js-yaml');
const jsone = require('json-e');
const rimraf = util.promisify(require('rimraf'));
const mkdirp = require('mkdirp');
const { listServices, writeRepoFile, readRepoYAML, writeRepoYAML, writeRepoJSON, REPO_ROOT, configToSchema, configToExample } = require('../../utils');

const SERVICES = listServices();
const CHART_DIR = path.join('infrastructure', 'k8s');
const TMPL_DIR = path.join(CHART_DIR, 'templates');

const CLUSTER_DEFAULTS = {
  level: () => 'notice',
  taskcluster_client_id: cfg => `static/taskcluster/${cfg.name}`,
};

// Defaults for things for which the type-based default (configToExample) is
// incorrect.
const DEFAULT_OVERRIDES = {
  'web_server.registered_clients': [],
};

// Things like port that we always set ourselves
const NON_CONFIGURABLE = [
  'port',
  'node_env',
];

// Shared across an entire deployment
const SHARED_CONFIG = {
  taskcluster_root_url: '.Values.rootUrl',
  pulse_hostname: '.Values.pulseHostname',
  pulse_vhost: '.Values.pulseVhost',
  pulse_amqps: '.Values.pulseAmqps',
  force_ssl: '.Values.forceSSL',
  trust_proxy: '.Values.trustProxy',
  node_env: '.Values.nodeEnv',
  error_config: '.Values.errorConfig',
  application_name: '.Values.applicationName',
  new_relic: '.Values.newRelic',
};

// default cpu, memory values per proc.  These are based on observations of
// the production systems at Mozilla, and while not perfect for every
// deployment, provide a good starting point.  Note that all values are
// "requires", not "limit".  All default to one replica.
const DEFAULT_RESOURCES = {
  'auth.web': ['100m', '200Mi'],
  'auth.purgeExpiredClients': ['800m', '500Mi'],
  'built_in_workers.server': ['10m', '50Mi'],
  'github.web': ['10m', '50Mi'],
  'github.worker': ['200m', '200Mi'],
  'github.sync': ['800m', '500Mi'],
  'hooks.web': ['50m', '50Mi'],
  'hooks.scheduler': ['10m', '50Mi'],
  'hooks.listeners': ['50m', '50Mi'],
  'hooks.expires': ['50m', '50Mi'],
  'index.web': ['50m', '50Mi'],
  'index.handlers': ['50m', '50Mi'],
  'index.expire': ['50m', '50Mi'],
  'notify.web': ['100m', '100Mi'],
  'notify.handler': ['50m', '100Mi'],
  'purge_cache.web': ['100m', '50Mi'],
  'purge_cache.expireCachePurges': ['800m', '500Mi'],
  'queue.web': ['400m', '200Mi'],
  'queue.claimResolver': ['50m', '50Mi'],
  'queue.deadlineResolver': ['50m', '100Mi'],
  'queue.dependencyResolver': ['100m', '100Mi'],
  'queue.expireArtifacts': ['200m', '100Mi'],
  'queue.expireTask': ['50m', '100Mi'],
  'queue.expireTaskGroups': ['50m', '50Mi'],
  'queue.expireTaskGroupMembers': ['100m', '50Mi'],
  'queue.expireTaskGroupSizes': ['800m', '500Mi'],
  'queue.expireTaskDependency': ['50m', '50Mi'],
  'queue.expireTaskRequirement': ['50m', '50Mi'],
  'queue.expireQueues': ['50m', '200Mi'],
  'queue.expireWorkerInfo': ['200m', '100Mi'],
  'secrets.web': ['100m', '50Mi'],
  'secrets.expire': ['800m', '500Mi'],
  'web_server.web': ['500m', '300Mi'],
  'web_server.scanner': ['800m', '500Mi'],
  'web_server.cleanup_expire_auth_codes': ['800m', '500Mi'],
  'web_server.cleanup_expire_access_tokens': ['800m', '500Mi'],
  'worker_manager.web': ['100m', '100Mi'],
  'worker_manager.provisioner': ['50m', '200Mi'],
  'worker_manager.workerscanner': ['200m', '200Mi'],
  'worker_manager.expire_workers': ['200m', '200Mi'],
  'worker_manager.expire_worker_pools': ['800m', '500Mi'],
  'worker_manager.expire_errors': ['800m', '500Mi'],
  'ui.web': ['50m', '10Mi'],
  'references.web': ['10m', '10Mi'],
};

const labels = (projectName, component) => ({
  'app.kubernetes.io/name': projectName,
  'app.kubernetes.io/instance': '{{ .Release.Name }}',
  'app.kubernetes.io/component': `${projectName}-${component.toLowerCase()}`,
  'app.kubernetes.io/part-of': 'taskcluster',
});

const renderTemplates = async (name, vars, procs, templates) => {
  for (const resource of ['serviceaccount', 'secret']) {
    const rendered = jsone(templates[resource], {
      projectName: `taskcluster-${name}`,
      labels: labels(`taskcluster-${name}`, 'secrets'),
      secrets: vars.map(v => {
        const val = v.toLowerCase();
        if (NON_CONFIGURABLE.includes(val)) {
          return null;
        }
        return {
          key: v,
          val: SHARED_CONFIG[val] || `.Values.${name.replace(/-/g, '_')}.${val}`,
        };
      }).filter(x => x !== null),
    });
    const file = `taskcluster-${name}-${resource}.yaml`;
    await writeRepoYAML(path.join(TMPL_DIR, file), rendered);
  }

  const ingresses = [];
  for (const [proc, conf] of Object.entries(procs)) {
    let tmpl;
    const context = {
      projectName: `taskcluster-${name}`,
      serviceName: name,
      configName: name.replace(/-/g, '_'),
      configProcName: proc.replace(/-/g, '_'),
      procName: proc,
      needsService: false,
      readinessPath: conf.readinessPath || `/api/${name}/v1/ping`,
      labels: labels(`taskcluster-${name}`, proc),
    };
    switch (conf['type']) {
      case 'web': {
        tmpl = 'deployment';
        context['needsService'] = true;
        const rendered = jsone(templates['service'], context);
        const file = `taskcluster-${name}-service-${proc}.yaml`;
        ingresses.push({
          projectName: `taskcluster-${name}`,
          paths: conf['paths'] || [`/api/${name}/*`], // TODO: This version of config is only for gcp ingress :(
        });
        await writeRepoYAML(path.join(TMPL_DIR, file), rendered);
        break;
      }
      case 'background': {
        tmpl = 'deployment';
        break;
      }
      case 'cron': {
        tmpl = 'cron';
        context['schedule'] = conf.schedule;
        context['deadlineSeconds'] = conf.deadline;
        break;
      }
      default: continue; // We don't do anything with build/heroku-only
    }
    const rendered = jsone(templates[tmpl], context);

    // json-e can't create a "naked" string for go templates to use to render an integer.
    // thankfully this is the only case where this bites us (so far), so we can just do some
    // post processing
    const replicaConfigString = `{{ int (.Values.${context.configName}.procs.${context.configProcName}.replicas) }}`;
    const processed = yaml.dump(rendered, { lineWidth: -1 }).replace('REPLICA_CONFIG_STRING', replicaConfigString);

    const filename = `taskcluster-${name}-${tmpl}-${proc}.yaml`;
    await writeRepoFile(path.join(TMPL_DIR, filename), processed);
  }
  return ingresses;
};

exports.tasks = [];

exports.tasks.push({
  title: `Load k8s templates`,
  requires: [],
  provides: ['k8s-templates'],
  run: async (requirements, utils) => {

    const templateFiles = glob.sync('infrastructure/tooling/templates/k8s/*.yaml', { cwd: REPO_ROOT });
    const templates = {};
    for (const f of templateFiles) {
      templates[path.basename(f, '.yaml')] = await readRepoYAML(f);
    }
    return {
      'k8s-templates': templates,
    };
  },
});

exports.tasks.push({
  title: `Clear k8s/templates dirctory`,
  requires: [],
  provides: ['k8s-templates-dir'],
  run: async (requirements, utils) => {
    await rimraf(TMPL_DIR);
    await mkdirp(TMPL_DIR);
  },
});

SERVICES.forEach(name => {
  exports.tasks.push({
    title: `Generate helm templates for ${name}`,
    requires: [`configs-${name}`, `procslist-${name}`, 'k8s-templates', 'k8s-templates-dir'],
    provides: [`ingresses-${name}`],
    run: async (requirements, utils) => {
      const procs = requirements[`procslist-${name}`];
      const templates = requirements['k8s-templates'];
      const vars = requirements[`configs-${name}`].map(v => v.var);
      vars.push('debug');
      return {
        [`ingresses-${name}`]: await renderTemplates(name, vars, procs, templates),
      };
    },
  });
});

// Now add ui/references separately
const extras = {
  ui: {
    vars: [
      { type: '!env', var: 'APPLICATION_NAME' },
      { type: '!env', var: 'GRAPHQL_SUBSCRIPTION_ENDPOINT' },
      { type: '!env', var: 'GRAPHQL_ENDPOINT' },
      { type: '!env', var: 'UI_LOGIN_STRATEGY_NAMES' },
      { type: '!env:string', var: 'BANNER_MESSAGE', optional: true },
      { type: '!env:json', var: 'SITE_SPECIFIC', optional: true },
    ],
    procs: {
      web: {
        type: 'web',
        readinessPath: '/',
        paths: [
          '/*',
        ],
      },
    },
  },
  references: {
    vars: [],
    procs: {
      web: {
        type: 'web',
        readinessPath: '/references/',
        paths: [
          '/references',
          '/references/*',
          '/schemas',
          '/schemas/*',
        ],
      },
    },
  },
};
Object.entries(extras).forEach(([name, { procs, vars }]) => {
  exports.tasks.push({
    title: `Generate helm templates for ${name}`,
    requires: ['k8s-templates'],
    provides: [`ingresses-${name}`],
    run: async (requirements, utils) => {
      const templates = requirements['k8s-templates'];
      return {
        [`ingresses-${name}`]: await renderTemplates(name, vars.map(v => v.var), procs, templates),
      };
    },
  });
});

exports.tasks.push({
  title: `Generate ingress`,
  requires: ['k8s-templates', 'ingresses-ui', 'ingresses-references', ...SERVICES.map(name => `ingresses-${name}`)],
  provides: [],
  run: async (requirements, utils) => {
    const ingresses = [];
    for (const [name, req] of Object.entries(requirements)) {
      if (name.startsWith('ingresses-')) {
        for (const ingress of req) {
          for (const path of ingress.paths) {
            ingresses.push({
              path,
              projectName: ingress.projectName,
            });
          }
        }
      }
    }
    const templates = requirements['k8s-templates'];
    const rendered = jsone(templates['ingress'], {
      ingresses,
      labels: labels(`taskcluster-ingress`, 'ingress'),
    });
    await writeRepoYAML(path.join(TMPL_DIR, 'ingress.yaml'), rendered);
  },
});

exports.tasks.push({
  title: `Generate values.yaml and values.schema.yaml`,
  requires: [
    ...SERVICES.map(name => `configs-${name}`),
    ...SERVICES.map(name => `procslist-${name}`),
    'static-clients',
  ],
  provides: [
    'config-values-schema',
    'config-values',
    'target-k8s',
  ],
  run: async (requirements, utils) => {
    const schema = {
      '$schema': 'http://json-schema.org/draft-06/schema#',
      '$id': '/schemas/common/values.schema.json#',
      type: 'object',
      title: 'Taskcluster Configuration Values',
      properties: {
        rootUrl: {
          type: 'string',
          format: 'uri',
          description: 'The url pointing to your deployment\'s ingress.',
        },
        applicationName: {
          type: 'string',
          description: 'The name of this deployment of Taskcluster.',
        },
        dockerImage: {
          type: 'string',
          description: 'The docker image containing taskcluster.',
        },
        ingressStaticIpName: {
          type: 'string',
          description: 'A google static ip object that the ingress can use to maintain the same ip address.',
        },
        ingressCertName: {
          type: 'string',
          description: 'A google certificate name that the ingress can use to set up tls.',
        },
        pulseHostname: {
          type: 'string',
          description: 'A rabbitmq cluster',
        },
        pulseAmqps: {
          type: 'boolean',
          description: 'whether to use amqps (TLS) to communicate with pulse (default true)',
        },
        pulseVhost: {
          type: 'string',
          description: 'The vhost this deployment will use on the rabbitmq cluster',
        },

        useKubernetesDnsServiceDiscovery: {
          type: 'boolean',
          description: 'If true, requests will not pass back in through load balancer to pass between services.',
        },

        // TODO: iirc google doesn't set the headers that we need to trust proxy so we don't set this, let's fix it
        forceSSL: {
          type: 'boolean',
          description: 'If true, all connections must use ssl',
        },
        trustProxy: {
          type: 'boolean',
          description: 'If true, only the external ingress needs to use ssl. connections to services are allowed however.',
        },
        nodeEnv: {
          type: 'string',
          description: 'You almost certainly want "production" here.',
        },
        meta: {
          type: 'object',
          description: [
            'Metadata about a deployment. This is not interpreted by Helm and can be used to store arbitrary metadata',
            'about the configuration for use by other tooling.  It is automatically generated by `yarn dev:init`.',
          ].join('\n'),
          additionalProperties: true,
        },
        errorConfig: {
          type: 'object',
          description: 'Error reporting configuration for lib-monitor.',
          properties: {
            reporter: {
              type: 'string',
              description: 'Which reporter to use.',
            },
          },
          required: ['reporter'],
          additionalProperties: true,
        },
        newRelic: {
          type: 'object',
          description: [
            'If present, configuration for New Relic to be used by all services.  The properties and values of this',
            'object are environment variables as given in',
            'https://docs.newrelic.com/docs/agents/nodejs-agent/installation-configuration/nodejs-agent-configuration',
            'If omitted, the New Relic library will not be loaded.',
          ].join('\n'),
          propertyNames: {
            pattern: '^NEW_RELIC_[A-Z0-9_]*$',
          },
          additionalProperties: { type: 'string' },
        },
      },
      required: ['rootUrl', 'dockerImage', 'pulseHostname', 'pulseVhost', 'forceSSL', 'trustProxy', 'nodeEnv', 'useKubernetesDnsServiceDiscovery'],
      additionalProperties: false,
    };

    // Something to copy-paste for users
    const exampleConfig = {
      applicationName: 'My Taskcluster',
      rootUrl: '...',
      dockerImage: '...',
      ingressStaticIpName: '...',
      ingressCertName: '...',
      pulseHostname: '...',
      pulseAmqps: true,
      pulseVhost: '...',
      forceSSL: false,
      trustProxy: true,
      nodeEnv: 'production',
      meta: {},
    };

    const currentRelease = await readRepoYAML(path.join('infrastructure', 'tooling', 'current-release.yml'));
    // Defaults that people can override
    const valuesYAML = {
      dockerImage: currentRelease.image,
      trustProxy: true,
      forceSSL: false,
      nodeEnv: 'production',
      useKubernetesDnsServiceDiscovery: true,
    };

    let configs = SERVICES.map(name => ({
      name,
      vars: requirements[`configs-${name}`],
      procs: requirements[`procslist-${name}`],
    }));
    configs = configs.concat(Object.entries(extras).map(([name, cfg]) => ({
      name,
      ...cfg,
    })));

    configs.forEach(cfg => {
      const confName = cfg.name.replace(/-/g, '_');
      exampleConfig[confName] = {};
      valuesYAML[confName] = {
        procs: {},
        debug: '',
      };
      schema.required.push(confName);
      schema.properties[confName] = {
        type: 'object',
        title: `Configuration options for ${cfg.name}`,
        properties: {
          procs: {
            type: 'object',
            title: 'Process settings for this service',
            properties: {},
            required: [],
            additionalProperties: false,
          },
          debug: {
            type: 'string',
            title: 'node debug env var',
          },
        },
        required: ['procs'],
        additionalProperties: false,
      };

      // Some services actually duplicate their config env vars in multiple places
      // so we de-dupe first. We use the variable name for this. If they've asked
      // for the same variable twice with different types then this is not our fault
      _.uniqBy(cfg.vars, 'var').forEach(v => {
        const varName = v.var.toLowerCase();
        if (NON_CONFIGURABLE.includes(varName) || Object.keys(SHARED_CONFIG).includes(varName)) {
          return;
        }
        schema.properties[confName].properties[varName] = configToSchema(v.type);
        if (!v.optional) {
          schema.properties[confName].required.push(varName);
        }
        if (Object.keys(CLUSTER_DEFAULTS).includes(varName)) {
          valuesYAML[confName][varName] = CLUSTER_DEFAULTS[varName](cfg);
        } else if (DEFAULT_OVERRIDES[`${confName}.${varName}`]) {
          exampleConfig[confName][varName] = DEFAULT_OVERRIDES[`${confName}.${varName}`];
        } else {
          exampleConfig[confName][varName] = configToExample(v.type);
        }
      });

      // Now for the procs
      const procSettings = schema.properties[confName].properties.procs;
      const defaultResource = (serviceName, proc) => {
        try {
          return {
            cpu: DEFAULT_RESOURCES[`${serviceName}.${proc}`][0],
            memory: DEFAULT_RESOURCES[`${serviceName}.${proc}`][1],
          };
        } catch (e) {
          // default for the defaults
          return { cpu: '50m', memory: '100Mi' };
        }
      };
      exampleConfig[confName].procs = {};
      Object.entries(cfg.procs).forEach(([n, p]) => {
        n = n.replace(/-/g, '_');
        if (['web', 'background'].includes(p.type)) {
          exampleConfig[confName].procs[n] = {
            // much smaller cpu defaults for dev deployments, since
            // they are generally idle
            cpu: '10m',
          };
          valuesYAML[confName].procs[n] = {
            replicas: p.defaultReplicas === undefined ? 1 : p.defaultReplicas,
            ...defaultResource(confName, n),
          };
          procSettings.required.push(n);
          procSettings.properties[n] = {
            type: 'object',
            properties: {
              replicas: { type: 'integer' },
              memory: { type: 'string' },
              cpu: { type: 'string' },
            },
            required: ['replicas', 'memory', 'cpu'],
            additionalProperties: false,
          };
        } else if (p.type === 'cron') {
          exampleConfig[confName].procs[n] = {
            // much smaller cpu defaults for dev deployments, since
            // they are generally idle
            cpu: '10m',
          };
          valuesYAML[confName].procs[n] = {
            ...defaultResource(confName, n),
          };
          procSettings.required.push(n);
          procSettings.properties[n] = {
            type: 'object',
            properties: {
              memory: { type: 'string' },
              cpu: { type: 'string' },
            },
            required: ['memory', 'cpu'],
            additionalProperties: false,
          };
        }
      });
    });

    // omit scopes and add a placeholder accessToken to each client
    exampleConfig.auth.static_clients = requirements['static-clients']
      .map(({ scopes, ...c }) => ({ ...c, accessToken: '...' }));

    await writeRepoJSON(path.join(CHART_DIR, 'values.schema.json'), schema);
    await writeRepoYAML(path.join(CHART_DIR, 'values.yaml'), valuesYAML); // helm requires this to be "yaml"
    await writeRepoYAML(path.join('dev-docs', 'dev-config-example.yml'), exampleConfig);

    return {
      'config-values-schema': schema,
      'config-values': valuesYAML,
      'target-k8s': true,
    };
  },
});
