const path = require('path');
const glob = require('glob');
const util = require('util');
const jsone = require('json-e');
const config = require('taskcluster-lib-config');
const rimraf = util.promisify(require('rimraf'));
const mkdirp = util.promisify(require('mkdirp'));
const {listServices, readRepoYAML, writeRepoYAML, writeRepoJSON, REPO_ROOT, configToSchema} = require('../../utils');

const SERVICES = listServices();
const CHART_DIR = path.join('infrastructure', 'k8s');
const TMPL_DIR = path.join(CHART_DIR, 'templates');

const CLUSTER_DEFAULTS = {
  level: 'notice',
};

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
    const file = `taskcluster-${name}-${tmpl}-${proc}.yaml`;
    await writeRepoYAML(path.join(TMPL_DIR, file), rendered);
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
    provides: [`ingresses-${name}`],
    run: async (requirements, utils) => {
      const procs = await readRepoYAML(path.join('services', name, 'procs.yml'));
      const templates = requirements['k8s-templates'];
      const vars = requirements[`configs-${name}`].map(v => v.var);
      return {[`ingresses-${name}`]: await renderTemplates(name, vars, procs, templates)};
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
      return {[`ingresses-${name}`]: await renderTemplates(name, vars.map(v => v.var), procs, templates)};
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
  requires: [...SERVICES.map(name => `configs-${name}`)],
  provides: [],
  run: async (requirements, utils) => {
    const schema = {
      '$schema': 'http://json-schema.org/draft-06/schema#',
      type: 'object',
      title: 'Taskcluster Configuration Values',
      properties: {},
      required: [],
      additionalProperties: false,
    };

    const exampleConfig = {};

    let configs = SERVICES.map(name => ({name, vars: requirements[`configs-${name}`]}));
    configs = configs.concat(Object.entries(extras).map(([name, {vars}]) => ({name, vars})));

    configs.forEach(cfg => {
      const confName = cfg.name.replace(/-/g, '_');
      exampleConfig[confName] = {};
      schema.required.push(confName);
      schema.properties[confName] = {
        type: 'object',
        title: `Configuration options for ${cfg.name}`,
        properties: {},
        required: [],
        additionalProperties: false,
      };
      cfg.vars.forEach(v => {
        const varName = v.var.toLowerCase();
        exampleConfig[confName][varName] = '...';
        schema.properties[confName].required.push(varName);
        schema.properties[confName].properties[varName] = configToSchema(v.type);
      });
    });

    await writeRepoJSON(path.join(CHART_DIR, 'values.schema.json'), schema);
    await writeRepoYAML(path.join(CHART_DIR, 'user-config-example.yaml'), exampleConfig);
  },
});
