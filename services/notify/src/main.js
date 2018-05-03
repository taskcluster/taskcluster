let debug             = require('debug')('notify');
let appsetup          = require('taskcluster-lib-app');
let loader            = require('taskcluster-lib-loader');
let config            = require('typed-env-config');
let monitor           = require('taskcluster-lib-monitor');
let validator         = require('taskcluster-lib-validate');
let docs              = require('taskcluster-lib-docs');
let taskcluster       = require('taskcluster-client');
let _                 = require('lodash');
let v1                = require('./api');
let Notifier          = require('./notifier');
let Handler           = require('./handler');
let exchanges         = require('./exchanges');
let IRC               = require('./irc');

// Create component loader
let load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => config({profile}),
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => monitor({
      project: cfg.monitoring.project || 'taskcluster-notify',
      enable: cfg.monitoring.enable,
      credentials: cfg.taskcluster.credentials,
      mock: profile === 'test',
      process,
    }),
  },

  validator: {
    requires: ['cfg'],
    setup: ({cfg}) => validator({
      prefix: 'notify/v1/',
      publish: cfg.app.publishMetaData,
      aws: cfg.aws,
    }),
  },

  reference: {
    requires: ['cfg'],
    setup: ({cfg}) => exchanges.reference({
      exchangePrefix:   cfg.app.exchangePrefix,
      credentials:      cfg.pulse,
    }),
  },

  docs: {
    requires: ['cfg', 'validator', 'reference'],
    setup: ({cfg, validator, reference}) => docs.documenter({
      credentials: cfg.taskcluster.credentials,
      tier: 'core',
      publish: cfg.app.publishMetaData,
      schemas: validator.schemas,
      references: [
        {
          name: 'api',
          reference: v1.reference({baseUrl: cfg.server.publicUrl + '/v1'}),
        }, {
          name: 'events',
          reference: reference,
        },
      ],
    }),
  },

  writeDocs: {
    requires: ['docs'],
    setup: ({docs}) => docs.write({docsDir: process.env['DOCS_OUTPUT_DIR']}),
  },

  publisher: {
    requires: ['cfg', 'validator', 'monitor'],
    setup: ({cfg, validator, monitor}) => exchanges.setup({
      credentials:        cfg.pulse,
      exchangePrefix:     cfg.app.exchangePrefix,
      validator:          validator,
      referencePrefix:    'notify/v1/exchanges.json',
      publish:            cfg.app.publishMetaData,
      aws:                cfg.aws,
      monitor:            monitor.prefix('publisher'),
    }),
  },

  listener: {
    requires: ['cfg'],
    setup: ({cfg}) => new taskcluster.PulseListener({
      credentials: cfg.pulse,
      queueName: cfg.app.listenerQueueName,
    }),
  },

  queue: {
    requires: [],
    setup: () => new taskcluster.Queue(),
  },

  notifier: {
    requires: ['cfg', 'publisher'],
    setup: ({cfg, publisher}) => new Notifier({
      email: cfg.app.sourceEmail,
      aws: cfg.aws,
      queueName: cfg.app.sqsQueueName,
      emailBlacklist: cfg.app.emailBlacklist,
      publisher,
    }),
  },

  irc: {
    requires: ['cfg', 'monitor'],
    setup: async ({cfg, monitor}) => {
      monitor = monitor.prefix('irc');
      let client = new IRC(_.merge(cfg.irc, {
        aws: cfg.aws,
        queueName: cfg.app.sqsQueueName,
      }));
      await client.start();
      return client;
    },
  },

  handler: {
    requires: ['profile', 'cfg', 'monitor', 'notifier', 'validator', 'listener', 'queue'],
    setup: async ({profile, cfg, monitor, notifier, validator, listener, queue}) => {
      let handler = new Handler({
        notifier,
        validator,
        monitor:            monitor.prefix('handler'),
        routePrefix:        cfg.app.routePrefix,
        listener,
        queue,
        testing:            profile === 'test',
      });
      return handler.listen();
    },
  },

  api: {
    requires: ['cfg', 'monitor', 'validator', 'notifier'],
    setup: ({cfg, monitor, validator, notifier}) => v1.setup({
      context:          {notifier},
      authBaseUrl:      cfg.taskcluster.authBaseUrl,
      publish:          cfg.app.publishMetaData,
      baseUrl:          cfg.server.publicUrl + '/v1',
      referencePrefix:  'notify/v1/api.json',
      aws:              cfg.aws,
      monitor:          monitor.prefix('api'),
      validator,
    }),
  },

  server: {
    requires: ['cfg', 'api', 'docs'],
    setup: ({cfg, api, docs}) => {

      debug('Launching server.');
      let app = appsetup(_.defaults({}, cfg.server, {docs}));
      app.use('/v1', api);
      return app.createServer();
    },
  },

}, ['profile', 'process']);

// If this file is executed launch component from first argument
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
