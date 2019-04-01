const loader = require('taskcluster-lib-loader');
const App = require('taskcluster-lib-app');
const monitorManager = require('./monitor');
const config = require('taskcluster-lib-config');
const SchemaSet = require('taskcluster-lib-validate');
const docs = require('taskcluster-lib-docs');
const builder = require('./api');

const {InMemoryDatastore} = require('./data-storage');
const {Provisioner} = require('./provisioner');
const {Provider} = require('./provider');
const {BiddingStrategy} = require('./bidding-strategy');

let load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => config({profile}),
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => monitorManager.setup({
      processName: process,
      verify: profile !== 'production',
      ...cfg.monitoring,
    }),
  },

  datastore: {
    require: ['cfg'],
    setup: async ({cfg}) =>{
      return new InMemoryDatastore({id: 'worker-manager'});
    },
  },

  schemaset: {
    requires: ['cfg'],
    setup: ({cfg}) => new SchemaSet({
      serviceName: 'worker-manager',
      publish: cfg.app.publishMetaData,
      rootUrl: cfg.taskcluster.rootUrl,
      aws: cfg.aws,
    }),
  },

  api: {
    requires: ['cfg', 'schemaset', 'monitor', 'datastore'],
    setup: async ({cfg, schemaset, monitor, datastore}) => builder.build({
      rootUrl: cfg.taskcluster.rootUrl,
      context: {
        datastore,
      },
      publish: cfg.app.publishMetaData,
      aws: cfg.aws,
      monitor: monitor.monitor('api'),
      schemaset,
    }),
  },

  docs: {
    requires: ['cfg', 'schemaset'],
    setup: ({cfg, schemaset}) => docs.documenter({
      credentials: cfg.taskcluster.credentials,
      rootUrl: cfg.taskcluster.rootUrl,
      projectName: 'taskcluster-worker-manager',
      tier: 'core',
      schemaset,
      publish: cfg.app.publishMetaData,
      references: [
        {
          name: 'api',
          reference: builder.reference(),
        }, {
          name: 'logs',
          reference: monitorManager.reference(),
        },
      ],
    }),
  },

  writeDocs: {
    requires: ['docs'],
    setup: ({docs}) => docs.write({docsDir: process.env['DOCS_OUTPUT_DIR']}),
  },

  server: {
    requires: ['cfg', 'api'],
    setup: ({cfg, api}) => App({
      port: Number(process.env.PORT || cfg.server.port),
      env: cfg.server.env,
      forceSSL: cfg.server.forceSSL,
      trustProxy: cfg.server.trustProxy,
      apis: [api],
    }),
  },

  providers: {
    requires: ['cfg'],
    setup: async ({cfg}) => {
      let p = new Map();
      for (let x of cfg.providers) {
        let providerClass = Provider.load(x.className);
        let provider = new providerClass(...x.args);
        p.set(provider.id, provider);
      }
      return p;
    },
  },

  biddingStrategies: {
    requires: ['cfg'],
    setup: async ({cfg}) => {
      let bs = new Map();
      for (let x of cfg.biddingStrategies) {
        let biddingStrategyClass = BiddingStrategy.load(x.className);
        let biddingStrategy = new biddingStrategyClass(...x.args);
        bs.set(biddingStrategy.id, biddingStrategy);
      }
      return bs;
    },
  },

  provisioner: {
    requires: ['providers', 'biddingStrategies', 'datastore'],
    setup: async ({providers, biddingStrategies, datastore}) => {
      return new Provisioner({
        iterationGap: 60,
        providers,
        biddingStrategies,
        datastore,
      });
    },
  },

  provisionerservice: {
    requires: ['provisioner'],
    setup: async ({provisioner}) => {
      await provisioner.initiate();
    },
  },
}, {
  profile: process.env.NODE_ENV,
  process: process.argv[2],
});

// If this file is executed launch component from first argument
if (!module.parent) {
  load.crashOnError(process.argv[2]);
}

module.exports = load;
