import Debug from 'debug';
import base from 'taskcluster-base';
import api from './api';
import path from 'path';
import Promise from 'promise';
import exchanges from './exchanges';
import Handlers from './handlers';
import _ from 'lodash';
import taskcluster from 'taskcluster-client';
import Github from 'github';

let debug = Debug('taskcluster-github');

let load = base.loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => base.config({profile}),
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => base.monitor({
      project: 'taskcluster-github',
      credentials: cfg.taskcluster.credentials,
      mock: profile === 'test',
      process,
    }),
  },

  validator: {
    requires: ['cfg'],
    setup: ({cfg}) => base.validator({
      prefix: 'github/v1/',
      aws: cfg.aws,
    }),
  },

  docs: {
    requires: ['cfg', 'validator', 'reference'],
    setup: ({cfg, validator, reference}) => base.docs({
      credentials: cfg.taskcluster.credentials,
      tier: 'core',
      schemas: validator.schemas,
      project: 'github',
      references: [
        {
          name: 'api',
          reference: api.reference({baseUrl: cfg.server.publicUrl + '/v1'}),
        }, {
          name: 'events',
          reference: reference,
        },
      ],
    }),
  },

  publisher: {
    requires: ['cfg', 'monitor', 'validator'],
    setup: async ({cfg, monitor, validator}) => exchanges.setup({
      credentials:        cfg.pulse,
      exchangePrefix:     cfg.app.exchangePrefix,
      validator:          validator,
      referencePrefix:    'github/v1/exchanges.json',
      publish:            process.env.NODE_ENV === 'production',
      aws:                cfg.aws,
      monitor:            monitor.prefix('publisher'),
    }),
  },

  github: {
    requires: ['cfg'],
    setup: ({cfg}) => {
      let github = new Github({
        promise: Promise,
      });
      if (cfg.github.credentials.token) {
        github.authenticate(cfg.github.credentials);
      }
      return github;
    },
  },

  api: {
    requires: ['cfg', 'monitor', 'validator', 'github', 'publisher'],
    setup: ({cfg, monitor, validator, github, publisher}) => api.setup({
      context:          {publisher, cfg, github},
      authBaseUrl:      cfg.taskcluster.authBaseUrl,
      publish:          process.env.NODE_ENV === 'production',
      baseUrl:          cfg.server.publicUrl + '/v1',
      referencePrefix:  'github/v1/api.json',
      aws:              cfg.aws,
      monitor:          monitor.prefix('api'),
      validator,
    }),
  },

  server: {
    requires: ['cfg', 'api', 'docs'],
    setup: ({cfg, api, docs}) => {

      debug('Launching server.');
      let app = base.app(cfg.server);
      app.use('/v1', api);
      return app.createServer();
    },
  },

  scheduler: {
    requires: ['cfg'],
    setup: ({cfg}) => new taskcluster.Scheduler(cfg.taskcluster),
  },

  reference: {
    requires: ['cfg'],
    setup: ({cfg}) => exchanges.reference({
      exchangePrefix:   cfg.app.exchangePrefix,
      credentials:      cfg.pulse,
    }),
  },

  handlers: {
    requires: ['cfg', 'github', 'monitor', 'scheduler', 'validator', 'reference'],
    setup: async ({cfg, github, monitor, scheduler, validator, reference}) => new Handlers({
      credentials: cfg.pulse,
      monitor: monitor.prefix('handlers'),
      reference,
      jobQueueName: cfg.app.jobQueueName,
      statusQueueName: cfg.app.statusQueueName,
      context: {cfg, github, scheduler, validator},
    }),
  },

  worker: {
    requires: ['handlers'],
    setup: async ({handlers}) => handlers.setup(),
  },
}, ['profile', 'process']);

if (!module.parent) {
  load(process.argv[2], {
    process: process.argv[2],
    profile: process.env.NODE_ENV,
  }).catch(err => {
    console.log(err.stack);
    process.exit(1);
  });
}

// Export load for tests
module.exports = load;
