const path = require('path');
const taskcluster = require('taskcluster-client');
const Handler = require('./handler');
const exchanges = require('./exchanges');
const loader = require('taskcluster-lib-loader');
const docs = require('taskcluster-lib-docs');
const config = require('typed-env-config');
const monitorBuilder = require('./monitor');
const SchemaSet = require('taskcluster-lib-validate');
const {Client, pulseCredentials} = require('taskcluster-lib-pulse');

let load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => config({profile}),
  },

  schemaset: {
    requires: ['cfg'],
    setup: ({cfg}) => {
      return new SchemaSet({
        serviceName: 'treeherder',
        publish: cfg.app.publishMetaData,
        aws: cfg.aws,
      });
    },
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => monitorBuilder.setup({
      level: cfg.app.level,
      enable: cfg.monitoring.enable,
      mock: profile !== 'production',
      processName: process,
    }),
  },

  validator: {
    requires: ['cfg', 'schemaset'],
    setup: ({cfg, schemaset}) => schemaset.validator(cfg.taskcluster.rootUrl),
  },

  pulseClient: {
    requires: ['cfg', 'monitor'],
    setup: ({cfg, monitor}) => {
      return new Client({
        namespace: cfg.pulse.namespace,
        monitor: monitor.monitor('pulse-client'),
        credentials: pulseCredentials(cfg.pulse.credentials),
      });
    },
  },

  publisher: {
    requires: ['cfg', 'pulseClient', 'schemaset'],
    setup: async ({cfg, pulseClient, schemaset}) => await exchanges.publisher({
      rootUrl: cfg.taskcluster.rootUrl,
      client: pulseClient,
      schemaset,
      publish: cfg.app.publishMetaData,
      aws: cfg.aws,
    }),
  },

  docs: {
    requires: ['cfg', 'schemaset'],
    setup: ({cfg, schemaset}) => docs.documenter({
      credentials: cfg.taskcluster.credentials,
      rootUrl: cfg.taskcluster.rootUrl,
      projectName: 'taskcluster-treeherder',
      tier: 'integrations',
      schemaset,
      publish: cfg.app.publishMetaData,
      references: [
        {
          name: 'events',
          reference: exchanges.reference({
            rootUrl: cfg.taskcluster.rootUrl,
            credentials: cfg.pulse.credentials,
          }),
        }, {
          name: 'logs',
          reference: monitorBuilder.reference(),
        },
      ],
    }),
  },

  writeDocs: {
    requires: ['docs'],
    setup: ({docs}) => docs.write({docsDir: process.env['DOCS_OUTPUT_DIR']}),
  },

  server: {
    requires: ['cfg', 'publisher', 'schemaset', 'monitor', 'docs', 'validator', 'pulseClient'],
    setup: async ({cfg, publisher, schemaset, monitor, docs, validator, pulseClient}) => {
      const queueEvents = new taskcluster.QueueEvents({
        rootUrl: cfg.taskcluster.rootUrl,
      });
      const queue = new taskcluster.Queue({
        rootUrl: cfg.taskcluster.rootUrl,
      });
      const prefix = cfg.treeherder.routePrefix;

      const handler = new Handler({
        cfg,
        queue,
        queueEvents,
        pulseClient,
        prefix,
        publisher,
        validator,
        monitor: monitor.monitor('handler'),
      });
      await handler.start();
    },
  },
}, {
  profile: process.env.NODE_ENV,
  process: process.argv[2],
});

// If this file is executed launch component from first argument
if (!module.parent) {
  load(process.argv[2]).catch(err => {
    console.log(err.stack);
    process.exit(1);
  });
}

module.exports = load;
