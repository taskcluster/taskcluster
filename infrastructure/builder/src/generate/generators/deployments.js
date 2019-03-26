const path = require('path');
const config = require('taskcluster-lib-config');
const {REPO_ROOT, services, readYAML, writeJSON} = require('../util');

const SERVICES = services().filter(s => ![
  'purge-cache',
  'treeherder',
  'login',
].includes(s)); // TODO: some not yet configured

/**
 * Special cases and hacks abound!
 */
const genBuiltin = (service, variable) => {
  if (variable.includes('AWS') && !['auth', 'queue', 'notify'].includes(service)) {
    return '';
  }
  switch (variable) {
  case 'AWS_ACCESS_KEY_ID': return `\${module.${service}_user.access_key_id}`;
  case 'AWS_SECRET_ACCESS_KEY': return `\${module.${service}_user.secret_access_key}`;
  case 'TASKCLUSTER_CLIENT_ID': return `static/taskcluster/${service}`;
  case 'TASKCLUSTER_ACCESS_TOKEN': return `\${random_string.${service}_access_token.result}`;
  case 'NODE_ENV': return 'production';
  case 'MONITORING_ENABLE': return 'true';
  case 'PUBLISH_METADATA': return 'false';

  // These next two are identical
  case 'AZURE_ACCOUNT': return `\${azurerm_storage_account.base.name}`;
  case 'AZURE_ACCOUNT_NAME': return `\${azurerm_storage_account.base.name}`;

  case 'PULSE_USERNAME': return `\${module.${service}_rabbitmq_user.username}`;
  case 'PULSE_PASSWORD': return `\${module.${service}_rabbitmq_user.password}`;
  case 'PULSE_HOSTNAME': return '${var.rabbitmq_hostname}';
  case 'PULSE_VHOST': return '${var.rabbitmq_vhost}';
  case 'FORCE_SSL': return 'false';
  case 'TRUST_PROXY': return 'true';

  // These 4 should be condensed into 2
  case 'TABLE_SIGNING_KEY': return `\${base64encode(random_string.${service}_table_crypto_key.result)}`;
  case 'TABLE_CRYPTO_KEY': return `\${random_string.${service}_table_signing_key.result}`;
  case 'AZURE_SIGNING_KEY': return `\${base64encode(random_string.${service}_azure_crypto_key.result)}`;
  case 'AZURE_CRYPTO_KEY': return `\${random_string.${service}_azure_signing_key.result}`;

  default: return undefined;
  }
};

/**
 * Special cases and hacks abound!
 */
const genVar = (service, variable) => {
  switch (variable) {
  case 'LEVEL': return {type: 'string', default: 'notice'};
  default: return {type: 'string', default: ''};
  }
};

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
      const vars = requirements[`env-vars-${name}`].map(v => v.var);
      const procs = requirements[`procs-${name}`];

      const secretName = `taskcluster-${name}`;

      const conf = {variable: {}};

      // All services need this even if they don't say so
      if (!vars.includes('NODE_ENV')) {
        vars.push('NODE_ENV');
      }

      // These are handled directly in tf
      ['PORT', 'TASKCLUSTER_ROOT_URL'].forEach(r => {
        if(vars.includes(r)) {
          vars.splice(vars.indexOf(r), 1);
        }
      });

      conf.module = {
        [`${name}-secrets`]: {
          source: 'modules/service-secrets',
          project_name: secretName,
          secrets: vars.reduce((w, v) => {
            const builtin = genBuiltin(name, v);
            if (builtin !== undefined) {
              w[v] = builtin;
            } else {
              const varName = `gen_${name}_${v}`;
              w[v] = `\${var.${varName}}`;
              conf.variable[varName] = genVar(name, v);
            }
            return w;
          }, {}),
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
      Object.assign(w['variable'], s.variable);
      return w;
    }, {module: {}, variable: {}});

    await writeJSON('infrastructure/terraform/services.tf.json', result);
    return {
      'kube-deployment-configs': result,
    };
  },
});
