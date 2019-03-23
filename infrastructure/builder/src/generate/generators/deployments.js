const path = require('path');
const config = require('taskcluster-lib-config');
const {REPO_ROOT, services, readYAML, writeJSON} = require('../util');

const SERVICES = services();

exports.tasks = [];

SERVICES.forEach(name => {
  exports.tasks.push({
    title: `Get config for ${name}`,
    requires: [],
    provides: [
      `env-vars-${name}`,
      `procs-${name}`,
    ],
    run: async (requirements, utils) => {
      const envVars = config({
        files: [{
          path: path.join(REPO_ROOT, 'services', name, 'config.yml'),
          required: true,
        }],
        getEnvVars: true,
      });

      const procs = await readYAML(path.join('services', name, 'procs.yml'));

      return {
        [`env-vars-${name}`]: envVars,
        [`procs-${name}`]: procs,
      };
    },
  });

  exports.tasks.push({
    title: `Generate Kubernetes Terraform for ${name}`,
    requires: [
      `env-vars-${name}`,
      `procs-${name}`,
    ],
    provides: [`kube-tf-${name}`],
    run: async (requirements, utils) => {
      const vars = requirements[`env-vars-${name}`];
      const procs = requirements[`procs-${name}`];

      const secretName = `taskcluster-${name}`;

      const conf = {
        module: {
          [`${name}-secrets`]: {
            source: 'modules/service-secrets',
            project_name: secretName,
            secrets: vars.reduce((w, v) => {
              w[v.var] = 'TODO';
              return w;
            }, {}),
          },
        },
      };

      Object.entries(procs).forEach(([k, meta]) => {
        let source = 'modules/deployment';
        let {schedule, deadline, readinessPath} = meta;
        let background;
        switch (meta.type) {
        case 'heroku-only':
          return;
        case 'build':
          return;
        case 'web':
          if (!readinessPath) {
            readinessPath = `/api/${name}/v1/ping`;
          }
          break;
        case 'background':
          background = true;
          break;
        case 'cron':
          source = 'modules/scheduled-job';
          break;
        default:
          throw new Error(`Undefined type of proc: ${meta.type}`);
        }
        conf['module'][`${name}-${k}`] = {
          source,
          project_name: `taskcluster-${name}`,
          service_name: name,
          proc_name: k,
          background_job: background,
          schedule,
          deadline_seconds: deadline,
          disabled_services: '${var.disabled_services}', // These are terraform templates, not js
          readiness_path: readinessPath,
          secret_name: secretName,
          secrets_hash: `\${module.${name}-secrets.secrets_hash}`,
          root_url: '${var.root_url}',
          secret_keys: `\${module.${name}-secrets.env_var_keys}`,
          docker_image: '${local.taskcluster_image_monoimage}',
        };
      });

      return {
        [`kube-tf-${name}`]: conf,
      };
    },
  });
});

exports.tasks.push({
  title: `Generate Deployment Configs`,
  requires: SERVICES.map(name => `kube-tf-${name}`),
  provides: [
    'kube-deployment-configs',
  ],
  run: async (requirements, utils) => {

    const result = Object.values(requirements).reduce((w, s) => {
      Object.assign(w['module'], s.module);
      return w;
    }, {module: {}});

    await writeJSON('infrastructure/terraform/services.tf.json', result);
    return {
      'kube-deployment-configs': result,
    };
  },
});
