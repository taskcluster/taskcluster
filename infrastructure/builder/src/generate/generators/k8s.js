const path = require('path');
const glob = require('glob');
const util = require('util');
const jsone = require('json-e');
const rimraf = util.promisify(require('rimraf'));
const mkdirp = util.promisify(require('mkdirp'));
const {listServices, readRepoYAML, writeRepoYAML, REPO_ROOT} = require('../../utils');

const SERVICES = listServices();
const OUT_DIR = path.join('infrastructure', 'k8s', 'chart', 'templates');

const renderTemplates = async (name, procs, templates) => {

  await rimraf(OUT_DIR);
  await mkdirp(OUT_DIR);

  for (const resource of ['role', 'rolebinding', 'serviceaccount', 'secret']) {
    const rendered = jsone(templates[resource], {
      projectName: `taskcluster-${name}`,
      secrets: [], // TODO: Come up with new way to do config
    });
    const file = `taskcluster-${name}-${resource}.yaml`;
    await writeRepoYAML(path.join(OUT_DIR, file), rendered);
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
          paths: conf['paths'] || [`api/${name}/*`], // TODO: This version of config is only for gcp ingress :(
        });
        await writeRepoYAML(path.join(OUT_DIR, file), rendered);
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
    await writeRepoYAML(path.join(OUT_DIR, file), rendered);
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
    title: `Generate helm templates for ${name}`,
    requires: ['k8s-templates'],
    provides: [`ingresses-${name}`],
    run: async (requirements, utils) => {
      const procs = await readRepoYAML(path.join('services', name, 'procs.yml'));
      const templates = requirements['k8s-templates'];
      return {[`ingresses-${name}`]: await renderTemplates(name, procs, templates)};
    },
  });
});

// Now add ui/references separately
const extras = {
  ui: {
    web: {
      type: 'web',
      readinessPath: '/',
      paths: [
        '/*',
      ],
    },
  },
  references: {
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
};
Object.entries(extras).forEach(([name, procs]) => {
  exports.tasks.push({
    title: `Generate helm templates for ${name}`,
    requires: ['k8s-templates'],
    provides: [`ingresses-${name}`],
    run: async (requirements, utils) => {
      const templates = requirements['k8s-templates'];
      return {[`ingresses-${name}`]: await renderTemplates(name, procs, templates)};
    },
  });
});

exports.tasks.push({
  title: `Generate ingress`,
  requires: ['k8s-templates', 'ingresses-ui', 'ingresses-references', ...SERVICES.map(name => `ingresses-${name}`)],
  provides: ['k8s-ingress'],
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
    await writeRepoYAML(path.join(OUT_DIR, 'ingress.yaml'), rendered);
  },
});
