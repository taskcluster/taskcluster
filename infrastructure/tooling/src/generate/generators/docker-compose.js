const path = require('path');
const { listServices, readRepoYAML, writeRepoYAML, writeRepoFile } = require('../../utils');

const SERVICES = listServices();

const COMPOSE_FILENAME = 'docker-compose.yml';
const NGINX_FILENAME = 'nginx.conf';

const ports = {
  ingress: ['8080:80'],

  auth: ['3011:80'],
  github: ['3012:80'],
  hooks: ['3013:80'],
  index: ['3014:80'],
  notify: ['3015:80'],
  object: ['3016:80'],
  'purge-cache': ['3017:80'],
  queue: ['3018:80'],
  secrets: ['3019:80'],
  'worker-manager': ['3020:80'],
  'web-server': ['3050:3050'],
  ui: ['3022:80'],
};

const servicePorts = (service) => (ports[service] || []);
const servicePrimaryPort = (service) => ports[service][0].split(':')[0];
const serviceHostPort = (service) => ports[service][0].split(':')[1];

const staticClients = [
  { 'clientId': 'static/taskcluster/built-in-workers', 'accessToken': 'j2Z6zW2QSLehailBXlosdw9e2Ti8R_Qh2M4buAEQfsMA' },
  { 'clientId': 'static/taskcluster/github', 'accessToken': 'j2Z6zW2QSLehailBXlosdw9e2Ti8R_Qh2M4buAEQfsMA' },
  { 'clientId': 'static/taskcluster/hooks', 'accessToken': 'j2Z6zW2QSLehailBXlosdw9e2Ti8R_Qh2M4buAEQfsMA' },
  { 'clientId': 'static/taskcluster/index', 'accessToken': 'j2Z6zW2QSLehailBXlosdw9e2Ti8R_Qh2M4buAEQfsMA' },
  { 'clientId': 'static/taskcluster/notify', 'accessToken': 'j2Z6zW2QSLehailBXlosdw9e2Ti8R_Qh2M4buAEQfsMA' },
  { 'clientId': 'static/taskcluster/object', 'accessToken': 'j2Z6zW2QSLehailBXlosdw9e2Ti8R_Qh2M4buAEQfsMA' },
  { 'clientId': 'static/taskcluster/purge-cache', 'accessToken': 'j2Z6zW2QSLehailBXlosdw9e2Ti8R_Qh2M4buAEQfsMA' },
  { 'clientId': 'static/taskcluster/queue', 'accessToken': 'j2Z6zW2QSLehailBXlosdw9e2Ti8R_Qh2M4buAEQfsMA' },
  { 'clientId': 'static/taskcluster/secrets', 'accessToken': 'j2Z6zW2QSLehailBXlosdw9e2Ti8R_Qh2M4buAEQfsMA' },
  { 'clientId': 'static/taskcluster/web-server', 'accessToken': 'j2Z6zW2QSLehailBXlosdw9e2Ti8R_Qh2M4buAEQfsMA' },
  { 'clientId': 'static/taskcluster/worker-manager', 'accessToken': 'j2Z6zW2QSLehailBXlosdw9e2Ti8R_Qh2M4buAEQfsMA' },
  { 'clientId': 'static/taskcluster/root', 'accessToken': 'j2Z6zW2QSLehailBXlosdw9e2Ti8R_Qh2M4buAEQfsMA' },
];

const getTokenByService = (service) => staticClients.find(client => client.clientId.includes(service)).accessToken;

const workerManagerProviders = {
  static: {
    providerType: 'static',
  },
};

const defaultValues = {
  NODE_ENV: 'development',

  DEBUG: '*',
  LEVEL: 'debug',
  FORCE_SSL: 'false',
  TRUST_PROXY: 'true',

  USERNAME_PREFIX: 'taskcluster',
  ADMIN_DB_URL: 'postgresql://postgres@postgres:5432/taskcluster',
  READ_DB_URL: 'postgresql://postgres@postgres:5432/taskcluster',
  WRITE_DB_URL: 'postgresql://postgres@postgres:5432/taskcluster',

  TASKCLUSTER_ROOT_URL: `http://ingress`,

  PULSE_USERNAME: 'admin',
  PULSE_PASSWORD: 'admin',
  PULSE_HOSTNAME: 'rabbitmq',
  PULSE_VHOST: 'local',
  PULSE_AMQPS: 'false',

  APPLICATION_NAME: 'Taskcluster',
  GRAPHQL_ENDPOINT: `http://localhost:${servicePrimaryPort('ingress')}/graphql`,
  GRAPHQL_SUBSCRIPTION_ENDPOINT: `http://localhost:${servicePrimaryPort('ingress')}/graphql`,
  UI_LOGIN_STRATEGY_NAMES: 'local',

  // Auth
  STATIC_CLIENTS: JSON.stringify(staticClients),
  DB_CRYPTO_KEYS: '[{"id": "dev-init", "algo": "aes-256", "key": "AUZzegzU1Xp3dW2tPRU615HXI04oJTt9NDIokH3HXN4="}]',

  // Worker Manager
  PROVIDERS: JSON.stringify(workerManagerProviders),

  // Github
  BOT_USERNAME: '',
  GITHUB_PRIVATE_PEM: '',
  GITHUB_APP_ID: '',
  WEBHOOK_SECRET: '',

  // Notify
  EMAIL_SOURCE_ADDRESS: 'root@local',

  // Queue
  PUBLIC_ARTIFACT_BUCKET: 'public-bucket',
  PRIVATE_ARTIFACT_BUCKET: 'private-bucket',
  ARTIFACT_REGION: 'local',

  AWS_ACCESS_KEY_ID: 'minioadmin',
  AWS_SECRET_ACCESS_KEY: 'miniopassword',
  AWS_FORCE_PATH_STYLE: 'true',
  AWS_SKIP_CORS_CONFIGURATION: 'true',
  AWS_ENDPOINT: 's3://s3:9000',

  // Web server
  SESSION_SECRET: 'quaYpvahRKmYOz2-wR4jaw',
  UI_LOGIN_STRATEGIES: '',
  PUBLIC_URL: `http://localhost:${servicePrimaryPort('ingress')}`,
  ADDITIONAL_ALLOWED_CORS_ORIGIN: '',
  REGISTERED_CLIENTS: '[]',
};

exports.tasks = [];

const healthcheck = (test) => ({
  test,
  interval: '2s',
  timeout: '4s',
  retries: 60,
  start_period: '3s',
});

const uiConfig = [
  { type: '!env', var: 'PORT' },
  { type: '!env', var: 'APPLICATION_NAME' },
  { type: '!env', var: 'GRAPHQL_SUBSCRIPTION_ENDPOINT' },
  { type: '!env', var: 'GRAPHQL_ENDPOINT' },
  { type: '!env', var: 'UI_LOGIN_STRATEGY_NAMES' },
  { type: '!env:string', var: 'BANNER_MESSAGE', optional: true },
  { type: '!env:json', var: 'SITE_SPECIFIC', optional: true },
];

exports.tasks.push({
  title: `Generate docker-compose.yml`,
  requires: [
    ...SERVICES.map(name => `configs-${name}`),
    ...SERVICES.map(name => `procslist-${name}`),
    'target-nginx.conf',
  ],
  provides: ['target-docker-compose.yml'],
  run: async (requirements, utils) => {
    const currentRelease = await readRepoYAML(path.join('infrastructure', 'tooling', 'current-release.yml'));

    const serviceEnv = (name) => {
      let config = name === 'ui' ? uiConfig : requirements[`configs-${name}`];
      if (!config) {
        console.debug(`No configs-${name}`);
        return {};
      }

      // prevent original object from being modified, as it will change autogenerated references
      config = [...config, {
        type: '!env',
        var: 'DEBUG',
        optional: true,
      }];

      return Object.fromEntries(config.map(cfg => {
        let value = defaultValues[cfg.var];

        switch (cfg.var) {
          case 'PORT':
            value = 80;
            break;

          case 'TASKCLUSTER_CLIENT_ID':
            value = `static/taskcluster/${name}`;
            break;

          case 'TASKCLUSTER_ACCESS_TOKEN':
            value = getTokenByService(name);
            break;
        }

        if (!value && !cfg.optional) {
          if (value === undefined) {
            console.warn(`${name} ${cfg.var} Missing required config`);
            value = '### MISSING ###';
          }
        }

        return [cfg.var, value];
      }));
    };

    const serviceDefinition = (name, overrides = {}) => ({
      image: currentRelease.image,
      networks: ['local'],
      environment: serviceEnv(name),
      ...overrides,
      ...((overrides.ports || servicePorts(name)).length > 0
        ? { ports: overrides.ports || servicePorts(name) } : {}),
    });

    const dockerCompose = {
      'x-autogenerated': 'This file is autogenerated',
      version: '3',
      volumes: {
        'db-data': {},
      },
      networks: {
        local: {
          driver: 'bridge',
        },
      },
      services: {
        rabbitmq: serviceDefinition('rabbitmq', {
          image: 'rabbitmq:3.7.8-management',
          healthcheck: healthcheck('rabbitmq-diagnostics ping'),
          ports: [
            '5672:5672',
            '15672:15672',
          ],
          environment: {
            RABBITMQ_DEFAULT_USER: 'admin',
            RABBITMQ_DEFAULT_PASS: 'admin',
            RABBITMQ_DEFAULT_VHOST: 'local',
          },
        }),
        postgres: serviceDefinition('postgres', {
          image: 'postgres:11',
          volumes: [
            'db-data:/var/lib/postgresql/data',
            './docker/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql',
          ],
          ports: ['5432:5432'],
          environment: {
            POSTGRES_DB: 'taskcluster',
            POSTGRES_HOST_AUTH_METHOD: 'trust',
            LC_COLLATE: 'en_US.UTF8',
            LC_CTYPE: 'en_US.UTF8',
          },
          healthcheck: healthcheck('pg_isready -U postgres'),
        }),
        pg_init_db: serviceDefinition('pg_init_db', {
          'x-info': 'Run this first to bring database up to date',
          command: ['script/db:upgrade'],
          depends_on: {
            postgres: {
              condition: 'service_healthy',
            },
          },
          environment: {
            USERNAME_PREFIX: defaultValues.USERNAME_PREFIX,
            ADMIN_DB_URL: defaultValues.ADMIN_DB_URL,
          },
        }),
        s3: serviceDefinition('s3', {
          image: 'minio/minio',
          command: 'server /data --console-address :9001',
          ports: ['3090:9000', '3091:9001'],
          volumes: [
            './docker/buckets:/data',
          ],
          environment: {
            MINIO_ROOT_USER: 'minioadmin',
            MINIO_ROOT_PASSWORD: 'miniopassword',
          },
          healthcheck: healthcheck('curl -I http://localhost:9000/minio/health/cluster'),
        }),
        s3_init_buckets: serviceDefinition('s3_init_buckets', {
          image: 'minio/mc',
          depends_on: {
            s3: {
              condition: 'service_healthy',
            },
          },
          entrypoint: [
            '/bin/sh -c "',
            '/usr/bin/mc config host rm local;',
            '/usr/bin/mc config host add --quiet --api s3v4 local http://s3:9000 minioadmin miniopassword;',
            '/usr/bin/mc rb --force local/public-bucket/;',
            '/usr/bin/mc mb --quiet local/public-bucket/;',
            '/usr/bin/mc policy set public local/public-bucket;',
            '/usr/bin/mc rb --force local/private-bucket/;',
            '/usr/bin/mc mb --quiet local/private-bucket/;',
            '/usr/bin/mc policy set public local/public-bucket;',
            '"',
          ].join(""),
          environment: {
            MINIO_ENDPOINT: 'http://s3:9000',
            MINIO_ROOT_USER: 'minioadmin',
            MINIO_ROOT_PASSWORD: 'miniopassword',
          },
        }),
        ui: serviceDefinition('ui', { command: ['ui/web'] }),
        ingress: serviceDefinition('ingress', {
          image: 'nginx:1.21.6',
          depends_on: ['ui', 'web-server-web'],
          volumes: [
            './docker/nginx.conf:/etc/nginx/nginx.conf',
          ],
        }),
      },
    };

    for (let name of SERVICES) {
      const procs = requirements[`procslist-${name}`];
      // only web services for now
      Object.keys(procs).forEach((proc) => {
        const isWeb = procs[proc].type === 'web';
        const allowedBackgroundJob = [
          'built-in-workers/server',
        ].includes(`${name}/${proc}`);

        if (!isWeb && !allowedBackgroundJob) {
          return;
        }

        const extraDependencies = ['queue', 'object'].includes(name) ? {
          s3_init_buckets: {
            condition: 'service_completed_successfully',
          },
        } : {};

        if (allowedBackgroundJob) {
          extraDependencies['queue-web'] = {
            condition: 'service_healthy',
          };
        }

        const healthchecks = isWeb ? {
          healthcheck: healthcheck(`wget -q --spider http://localhost:${serviceHostPort(name)}/api/${name}/v1/ping`),
        } : {};

        dockerCompose.services[`${name}-${proc}`] = serviceDefinition(name, {
          // entrypoint is defined in dockerfile
          // command is defined in entrypoint and is SERVICE/PROC
          command: [`${name}/${proc}`],
          ...healthchecks,
          depends_on: {
            rabbitmq: {
              condition: 'service_healthy',
            },
            postgres: {
              condition: 'service_healthy',
            },
            ...extraDependencies,
          },
        });
      });
    }

    await writeRepoYAML(path.join('.', COMPOSE_FILENAME), dockerCompose);
    return {
      'target-docker-compose.yml': dockerCompose,
    };
  },
});

exports.tasks.push({
  title: `Generate nginx.conf`,
  requires: [],
  provides: ['target-nginx.conf'],
  run: async (requirements, utils) => {
    const extraDirectives = `proxy_hide_header Content-Security-Policy;
      proxy_set_header Host ingress;`;

    const conf = `
worker_processes  1;
error_log  stderr;
events {
  worker_connections  1024;
}
http {
  resolver 127.0.0.11 ipv6=off;  # needed for docker to resolve service names
  default_type  application/octet-stream;
  access_log  /dev/stdout;
  sendfile on;
  charset utf-8;

  server {
    listen 80;
    server_name _;

    location / {
      proxy_pass http://ui;
      ${extraDirectives}
    }
    location /login {
      proxy_pass http://web-server-web:${serviceHostPort('web-server')};
      ${extraDirectives}
    }
    location /graphql {
      proxy_pass http://web-server-web:${serviceHostPort('web-server')};
      ${extraDirectives}
    }
    location /subscription {
      proxy_pass http://web-server-web:${serviceHostPort('web-server')};
      ${extraDirectives}
    }
${SERVICES.filter(name => !!ports[name]).map(name => `
    location /api/${name} {
      proxy_pass http://${name}-web;
      ${extraDirectives}
    }`).join('\n')}
  }
}
`;

    await writeRepoFile(path.join('.', 'docker', NGINX_FILENAME), conf);
  },
});
