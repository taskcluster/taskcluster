const _ = require('lodash');
const path = require('path');
const glob = require('glob');
const util = require('util');
const yaml = require('js-yaml');
const jsone = require('json-e');
const config = require('taskcluster-lib-config');
const rimraf = util.promisify(require('rimraf'));
const mkdirp = util.promisify(require('mkdirp'));
const {listServices, writeRepoFile, readRepoYAML, writeRepoYAML, writeRepoJSON, REPO_ROOT, configToSchema, configToExample} = require('../../utils');

const SERVICES = listServices();
const CHART_DIR = path.join('infrastructure', 'k8s');
const TMPL_DIR = path.join(CHART_DIR, 'templates');

const CLUSTER_DEFAULTS = {
  level: 'notice',
  node_env: 'production',

  // TODO: iirc google doesn't set the headers that we need to trust proxy so we don't set this, let's fix it
  force_ssl: false,
  trust_proxy: true,
};

const NON_CONFIGURABLE = [
  'port',
  'taskcluster_root_url', // This is actually configured at the cluster level
];

const renderTemplates = async (name, vars, procs, templates) => {

  await rimraf(TMPL_DIR);
  await mkdirp(TMPL_DIR);

  for (const resource of ['role', 'rolebinding', 'serviceaccount', 'secret']) {
    const rendered = jsone(templates[resource], {
      projectName: `taskcluster-${name}`,
      secrets: vars.map(v => ({
        key: v,
        val: `.Values.${name.replace(/-/g, '_')}.${v.toLowerCase()}`,
      })),
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
    const processed = yaml.safeDump(rendered, {lineWidth: -1}).replace('REPLICA_CONFIG_STRING', replicaConfigString);

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

    const templateFiles = glob.sync('infrastructure/builder/templates/k8s/*.yaml', {cwd: REPO_ROOT});
    const templates = {};
    for (const f of templateFiles) {
      templates[path.basename(f, '.yaml')] = await readRepoYAML(f);
    }
    return {
      'k8s-templates': templates,
    };
  },
});

SERVICES.forEach(name => {
  exports.tasks.push({
    title: `Get config options for ${name}`,
    requires: [],
    provides: [`configs-${name}`],
    run: async (requirements, utils) => {
      const envVars = config({
        files: [{
          path: path.join(REPO_ROOT, 'services', name, 'config.yml'),
          required: true,
        }],
        getEnvVars: true,
      });
      return {
        [`configs-${name}`]: envVars,
      };
    },
  });
  exports.tasks.push({
    title: `Generate helm templates for ${name}`,
    requires: [`configs-${name}`, 'k8s-templates'],
    provides: [`ingresses-${name}`, `procslist-${name}`],
    run: async (requirements, utils) => {
      const procs = await readRepoYAML(path.join('services', name, 'procs.yml'));
      const templates = requirements['k8s-templates'];
      const vars = requirements[`configs-${name}`].map(v => v.var);
      return {
        [`ingresses-${name}`]: await renderTemplates(name, vars, procs, templates),
        [`procslist-${name}`]: procs,
      };
    },
  });
});

// Now add ui/references separately
const extras = {
  ui: {
    vars: [],
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
Object.entries(extras).forEach(([name, {procs, vars}]) => {
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
    const rendered = jsone(templates['ingress'], {ingresses});
    await writeRepoYAML(path.join(TMPL_DIR, 'ingress.yaml'), rendered);
  },
});

exports.tasks.push({
  title: `Generate values.yaml and values.schema.yaml`,
  requires: [...SERVICES.map(name => `configs-${name}`), ...SERVICES.map(name => `procslist-${name}`)],
  provides: [],
  run: async (requirements, utils) => {
    const schema = {
      '$schema': 'http://json-schema.org/draft-06/schema#',
      type: 'object',
      title: 'Taskcluster Configuration Values',
      properties: {
        rootUrl: {
          type: 'string',
          format: 'uri',
        },
        dockerImage: {
          type: 'string',
        },
      },
      required: ['rootUrl', 'dockerImage'],
      aditionalProperties: false,
    };

    // Something to copy-paste for users
    const exampleConfig = {
      rootUrl: '...',
      dockerImage: '...',
    };
    const variablesYAML = {}; // Defaults that people can override

    let configs = SERVICES.map(name => ({
      name,
      vars: requirements[`configs-${name}`],
      procs: requirements[`procslist-${name}`],
    }));
    configs = configs.concat(Object.entries(extras).map(([name, {vars, procs}]) => ({
      name,
      vars,
      procs,
    })));

    configs.forEach(cfg => {
      const confName = cfg.name.replace(/-/g, '_');
      exampleConfig[confName] = {};
      variablesYAML[confName] = {
        procs: {},
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
        if (NON_CONFIGURABLE.includes(varName)) {
          return; // Things like port that we always set ourselves
        }
        schema.properties[confName].required.push(varName);
        schema.properties[confName].properties[varName] = configToSchema(v.type);
        if (Object.keys(CLUSTER_DEFAULTS).includes(varName)) {
          variablesYAML[confName][varName] = CLUSTER_DEFAULTS[varName];
        } else {
          exampleConfig[confName][varName] = configToExample(v.type);
        }
      });

      // Now for the procs
      const procSettings = schema.properties[confName].properties.procs;
      Object.entries(cfg.procs).forEach(([n, p]) => {
        n = n.replace(/-/g, '_');
        if (['web', 'background'].includes(p.type)) {
          variablesYAML[confName].procs[n] = {
            replicas: 1,
            cpu: '50m', // TODO: revisit these defaults
            memory: '100Mi',
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
          };
        } else if (p.type === 'cron') {
          variablesYAML[confName].procs[n] = {
            cpu: '50m', // TODO: revisit these defaults
            memory: '100Mi',
          };
          procSettings.required.push(n);
          procSettings.properties[n] = {
            type: 'object',
            properties: {
              memory: { type: 'string' },
              cpu: { type: 'string' },
            },
            required: ['memory', 'cpu'],
          };
        }
      });
    });

    await writeRepoJSON(path.join(CHART_DIR, 'values.schema.json'), schema);
    await writeRepoYAML(path.join(CHART_DIR, 'variables.yaml'), variablesYAML);
    await writeRepoYAML('user-config-example.yaml', exampleConfig);
  },
});
