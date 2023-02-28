const path = require('path');
const { listServices, readRepoYAML, writeRepoYAML, writeRepoFile } = require('../../utils');

const SERVICES = listServices();

const COMPOSE_FILENAME = 'docker-compose.yml';
const DEV_COMPOSE_FILENAME = 'docker-compose.dev.yml';
const PROD_COMPOSE_FILENAME = 'docker-compose.prod.yml';
const NGINX_FILENAME = 'nginx.conf';
const ENV_FILE_PATH = './docker/env/';

const ports = {
  taskcluster: ['80:80'],

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
  references: ['3023:80'],
};

const servicePorts = (service) => (ports[service] || []);
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
  { 'clientId': 'static/generic-worker-compose-client', 'accessToken': 'j2Z6zW2QSLehailBXlosdw9e2Ti8R_Qh2M4buAEQfsMA',
    description: 'Static generic worker client', scopes: ['*'] },
];

const getTokenByService = (service) => staticClients.find(client => client.clientId.includes(service)).accessToken;

const workerManagerProviders = {
  static: {
    providerType: 'static',
  },
};

const defaultValues = {
  NODE_ENV: 'development',

  DEBUG: '',
  LEVEL: 'info',
  FORCE_SSL: 'false',
  TRUST_PROXY: 'true',

  USERNAME_PREFIX: 'taskcluster',
  ADMIN_DB_URL: 'postgresql://postgres@postgres:5432/taskcluster',
  READ_DB_URL: 'postgresql://postgres@postgres:5432/taskcluster',
  WRITE_DB_URL: 'postgresql://postgres@postgres:5432/taskcluster',

  TASKCLUSTER_ROOT_URL: `http://taskcluster`,

  PULSE_USERNAME: 'admin',
  PULSE_PASSWORD: 'admin',
  PULSE_HOSTNAME: 'rabbitmq',
  PULSE_VHOST: 'local',
  PULSE_AMQPS: 'false',

  APPLICATION_NAME: 'Taskcluster',
  GRAPHQL_ENDPOINT: `http://taskcluster/graphql`,
  GRAPHQL_SUBSCRIPTION_ENDPOINT: `http://taskcluster/subscription`,
  UI_LOGIN_STRATEGY_NAMES: 'local',
  SITE_SPECIFIC: JSON.stringify({
    tutorial_worker_pool_id: 'docker-compose/generic-worker',
    tutorial_worker_schema: 'generic-simple-posix',
  }),

  // Auth
  STATIC_CLIENTS: JSON.stringify(staticClients),
  DB_CRYPTO_KEYS: JSON.stringify([{ id: 'dev-init', algo: 'aes-256', key: 'AUZzegzU1Xp3dW2tPRU615HXI04oJTt9NDIokH3HXN4=' }]),

  // Worker Manager
  PROVIDERS: JSON.stringify(workerManagerProviders),

  // Github
  BOT_USERNAME: '',
  GITHUB_PRIVATE_PEM: '',
  GITHUB_APP_ID: '',
  WEBHOOK_SECRET: '',

  // Notify
  EMAIL_SOURCE_ADDRESS: 'root@local',

  // Object
  BACKENDS: '{"everything":{"backendType":"aws","accessKeyId":"minioadmin","secretAccessKey":"miniopassword","bucket":"public-bucket","signGetUrls":"false","s3ForcePathStyle":true,"endpoint":"http://taskcluster/"}}',
  BACKEND_MAP: '[{"backendId":"everything","when":"all"}]',

  // Queue
  PUBLIC_ARTIFACT_BUCKET: 'public-bucket',
  PRIVATE_ARTIFACT_BUCKET: 'private-bucket',
  ARTIFACT_REGION: 'local',

  AWS_ACCESS_KEY_ID: 'minioadmin',
  AWS_SECRET_ACCESS_KEY: 'miniopassword',
  AWS_FORCE_PATH_STYLE: 'true',
  AWS_SKIP_CORS_CONFIGURATION: 'true',
  AWS_ENDPOINT: 'http://taskcluster/',

  // Web server
  SESSION_SECRET: 'quaYpvahRKmYOz2-wR4jaw',
  UI_LOGIN_STRATEGIES: '',
  PUBLIC_URL: 'http://taskcluster',
  ADDITIONAL_ALLOWED_CORS_ORIGIN: '',
  REGISTERED_CLIENTS: '[]',
};

const nodemonCmd = (service) => {
  return [
    'nodemon',
    '--delay 3',
    '--watch services',
    '--watch libraries',
    `--watch services/${service}`, // limit restarts to single service
  ].join(' ');
};

exports.tasks = [];

const healthcheck = (test) => ({
  test,
  interval: '3s',
  timeout: '4s',
  retries: 100,
  start_period: '3s',
});

const uiConfig = [
  { type: '!env', var: 'PORT' },
  { type: '!env', var: 'APPLICATION_NAME' },
  { type: '!env', var: 'TASKCLUSTER_ROOT_URL' },
  { type: '!env', var: 'GRAPHQL_SUBSCRIPTION_ENDPOINT' },
  { type: '!env', var: 'GRAPHQL_ENDPOINT' },
  { type: '!env', var: 'UI_LOGIN_STRATEGY_NAMES' },
  { type: '!env:string', var: 'BANNER_MESSAGE', optional: true },
  { type: '!env:json', var: 'SITE_SPECIFIC', optional: true },
];

const allowedBackgroundJobs = ['built-in-workers/server'];

exports.tasks.push({
  title: `Generate docker-compose files`,
  requires: [
    ...SERVICES.map(name => `configs-${name}`),
    ...SERVICES.map(name => `procslist-${name}`),
    'target-nginx.conf',
  ],
  provides: [
    'target-docker-compose.yml',
    'target-docker-compose.dev.yml',
    'target-docker-compose.prod.yml',
    'target-env-files',
  ],
  run: async (requirements, utils) => {
    const currentRelease = await readRepoYAML(path.join('infrastructure', 'tooling', 'current-release.yml'));
    const [, currentVersion] = currentRelease.image.split(':');

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

    const serviceDefinition = (name, { _noPorts, _useEnvFile, ...opts } = {}) => ({
      image: currentRelease.image,
      networks: ['local'],
      ...(_useEnvFile ? { env_file: `${ENV_FILE_PATH}.${name}` } : {}),
      ...opts,
      ...(!_noPorts && (opts.ports || servicePorts(name).length > 0)
        ? { ports: opts.ports || servicePorts(name) } : {}),
    });

    const serviceDefinitionProd = (name, profiles = null) => ({
      environment: {
        NODE_ENV: 'production',
      },
      ...(profiles ? { profiles } : {}),
    });

    const serviceDefinitionDev = (name, profiles = null, originalCommand) => ({
      image: `${currentRelease.image}-devel`,
      environment: {
        NODE_ENV: 'development',
        DEBUG: '*',
      },
      volumes: [
        './db:/app/db', // in case of new migrations
        './generated:/app/generated', // db schema
        './clients:/app/clients',
        './libraries:/app/libraries',
        `./services/${name}:/app/services/${name}`, // service should only care about own code
      ],
      ...(profiles ? { profiles } : {}),
      command: '',
      entrypoint: `/bin/sh -c "${originalCommand.replace(/^node /, `${nodemonCmd(name)} `)}"`,
    });

    const dockerCompose = {
      'x-autogenerated': 'This file is autogenerated',
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
        ui: serviceDefinition('ui', {
          command: 'ui/web',
          _useEnvFile: true,
        }),
        references: serviceDefinition('references', {
          command: 'references/web',
          environment: {
            TASKCLUSTER_ROOT_URL: defaultValues.TASKCLUSTER_ROOT_URL,
          },
        }),
        taskcluster: serviceDefinition('taskcluster', {
          image: 'nginx:1.21.6',
          depends_on: ['ui', 'web-server-web'],
          volumes: [
            './docker/nginx.conf:/etc/nginx/nginx.conf',
          ],
          healthcheck: healthcheck('curl -I http://localhost/'),
        }),
        tc_admin_init: serviceDefinition('tc_admin_init', {
          image: 'taskcluster/tc-admin:3.2.0',
          volumes: ['./docker/tc-admin:/app'],
          working_dir: '/app',
          'x-info': 'This script provisions taskcluster configuration. See docker/tc-admin for details',
          environment: {
            TASKCLUSTER_ROOT_URL: defaultValues.TASKCLUSTER_ROOT_URL,
            TASKCLUSTER_CLIENT_ID: 'static/taskcluster/root',
            TASKCLUSTER_ACCESS_TOKEN: getTokenByService('root'),
          },
          entrypoint: [
            '/bin/sh -c "',
            'echo \'Applying config\'; tc-admin apply ||true;',
            '"',
          ].join(' '),
          depends_on: Object.fromEntries(
            ['auth-web', 'hooks-web', 'queue-web', 'worker-manager-web', 'secrets-web', 'taskcluster'].map(
              svc => ([svc, { condition: 'service_healthy' }]),
            ),
          ),
        }),
      },
    };

    const dockerComposeProd = {
      'x-autogenerated': 'This file is autogenerated',
      services: {
        pg_init_db: serviceDefinitionProd('pg_init_db', null),
        ui: serviceDefinitionProd('ui', null),
      },
    };

    const dockerComposeDev = {
      'x-autogenerated': 'This file is autogenerated',
      services: {
        pg_init_db: { volumes: ['./db:/app/db'] },
        ui: {
          image: 'taskcluster/ui',
          build: {
            context: './ui',
            dockerfile: 'Dockerfile',
          },
          environment: {
            TASKCLUSTER_ROOT_URL: 'http://taskcluster',
          },
          command: 'start:docker',
          volumes: [
            './generated:/app/generated',
            '.all-contributorsrc:/app/.all-contributorsrc',
            './ui:/app/ui',
          ],
        },
      },
    };

    ['standalone', 'static'].forEach(type => {
      dockerCompose.services[`generic-worker-${type}`] = serviceDefinition('generic-worker', {
        image: `taskcluster/generic-worker:${currentVersion}`, // this image is built locally at the moment
        restart: 'unless-stopped', // if they crash, restart it to pick up next jobs
        volumes: [
          './docker/generic-worker-config.json:/etc/generic-worker/config.json',
          './docker/worker-runner-config.json:/etc/generic-worker/worker-runner.json',
        ],
        command: type,
        environment: {
          TASKCLUSTER_ROOT_URL: 'http://taskcluster',
          TASKCLUSTER_CLIENT_ID: 'static/generic-worker-compose-client',
          TASKCLUSTER_ACCESS_TOKEN: getTokenByService('generic-worker'),
        },
        ...(type === 'static' ? { profiles: ['workers'] } : {}), // start only standalone by default
        depends_on: {
          rabbitmq: { condition: 'service_healthy' },
          'auth-web': { condition: 'service_healthy' },
          'queue-web': { condition: 'service_healthy' },
          taskcluster: { condition: 'service_started' },
          tc_admin_init: { condition: 'service_completed_successfully' },
        },
      });

      // allow rebuild
      dockerComposeDev.services[`generic-worker-${type}`] = serviceDefinition('generic-worker', {
        image: `taskcluster/generic-worker:${currentVersion}`,
        build: {
          context: '.',
          dockerfile: 'generic-worker.Dockerfile',
        },
      });
    });

    const envFiles = {
      ui: serviceEnv('ui'),
    };

    for (let name of SERVICES) {
      const procs = requirements[`procslist-${name}`];
      // only web services for now
      Object.keys(procs).forEach((proc) => {
        const { type } = procs[proc];
        const isWeb = type === 'web';
        const isBackground = type === 'background';
        const isCron = type === 'cron';
        const allowedBackgroundJob = allowedBackgroundJobs.includes(`${name}/${proc}`);

        if (!isWeb && !isBackground && !isCron && !allowedBackgroundJob) {
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

        const serviceOptions = {
          // entrypoint is defined in dockerfile
          // command is defined in entrypoint and is SERVICE/PROC
          command: [`${name}/${proc}`],
          depends_on: {
            rabbitmq: {
              condition: 'service_healthy',
            },
            postgres: {
              condition: 'service_healthy',
            },
            ...extraDependencies,
          },
          _useEnvFile: true,
        };

        if (isWeb) {
          serviceOptions['healthcheck'] = healthcheck(`wget -q --spider http://localhost:${serviceHostPort(name)}/api/${name}/v1/ping`);
        }

        let serviceSuffix = '';
        if (!allowedBackgroundJob && (isCron || isBackground)) {
          serviceOptions['profiles'] = [type, name, `${name}-${type}`];
          serviceOptions['_noPorts'] = true;
          serviceSuffix = `-${type}`;
        }

        const svcName = `${name}${serviceSuffix}-${proc}`;
        dockerCompose.services[svcName] = serviceDefinition(name, serviceOptions);
        dockerComposeProd.services[svcName] = serviceDefinitionProd(name, serviceOptions['profiles']);
        dockerComposeDev.services[svcName] = serviceDefinitionDev(name, serviceOptions['profiles'], procs[proc].command);
        envFiles[name] = serviceEnv(name);
      });
    }

    await writeRepoYAML(path.join('.', COMPOSE_FILENAME), dockerCompose);
    await writeRepoYAML(path.join('.', PROD_COMPOSE_FILENAME), dockerComposeProd);
    await writeRepoYAML(path.join('.', DEV_COMPOSE_FILENAME), dockerComposeDev);

    await Promise.all(
      Object.keys(envFiles)
        .map(svcName => writeRepoFile(
          `${ENV_FILE_PATH}.${svcName}`,
          `# This file is autogenerated for ${svcName} service\n` +
          '# If you need to override some values, please use docker-compose.override.yml file instead\n' +
          Object.entries(envFiles[svcName])
            .map(([envName, envValue]) => `${envName}=${typeof envValue === 'undefined' ? '' : envValue}`)
            .join('\n') + '\n',
        )),
    );

    return {
      'target-docker-compose.yml': dockerCompose,
      'target-docker-compose.prod.yml': dockerComposeProd,
      'target-docker-compose.dev.yml': dockerComposeDev,
      'target-env-files': envFiles,
    };
  },
});

exports.tasks.push({
  title: `Generate nginx.conf`,
  requires: [],
  provides: ['target-nginx.conf'],
  run: async (requirements, utils) => {
    const extraDirectives = `proxy_hide_header Content-Security-Policy;
      proxy_set_header Host taskcluster;`;

    const conf = `
# this file is autogenerated

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
      set $pass http://ui;
      proxy_pass $pass;
      ${extraDirectives}
    }
    location /references {
      set $pass http://references;
      proxy_pass $pass;
      ${extraDirectives}
    }
    location /schemas {
      set $pass http://references;
      proxy_pass $pass;
      ${extraDirectives}
    }
    location /login {
      set $pass http://web-server-web:${serviceHostPort('web-server')};
      proxy_pass $pass;
      ${extraDirectives}
    }
    location /graphql {
      set $pass http://web-server-web:${serviceHostPort('web-server')};
      proxy_pass $pass;
      ${extraDirectives}
    }
    location /subscription {
      set $pass http://web-server-web:${serviceHostPort('web-server')};
      proxy_pass $pass;
      ${extraDirectives}
      proxy_set_header Upgrade $http_upgrade; # websocket
      proxy_set_header Connection "Upgrade"; # websocket
    }
    location ~* /(public|private)-bucket/ {
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_set_header Host $http_host;

      proxy_connect_timeout 300;
      proxy_http_version 1.1;
      proxy_set_header Connection "";
      chunked_transfer_encoding off;

      proxy_pass http://s3:9000;
    }
${SERVICES.filter(name => !!ports[name]).map(name => `
    location /api/${name} {
      set $pass http://${name}-web;
      proxy_pass $pass;
      ${extraDirectives}
    }`).join('\n')}
  }
}
`;

    await writeRepoFile(path.join('.', 'docker', NGINX_FILENAME), conf);
  },
});
