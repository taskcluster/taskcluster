const loader = require('taskcluster-lib-loader');
const App = require('taskcluster-lib-app');
const monitor = require('taskcluster-lib-monitor');
const config = require('typed-env-config');
const SchemaSet = require('taskcluster-lib-validate');
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
    setup: ({process, profile, cfg}) => monitor({
      rootUrl: cfg.taskcluster.rootUrl,
      projectName: 'taskcluster-worker-manager',
      enable: cfg.monitoring.enable,
      credentials: cfg.taskcluster.credentials,
      mock: profile !== 'production',
      process,
    }),
  },

  datastore: {
    require: ['cfg'],
    setup: async ({cfg}) =>{
      return new InMemoryDatastore({id: 'worker-manager'});
    }
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
      monitor: monitor.prefix('api'),
      schemaset,
    }),
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
      let providers = [];
      for (let x of cfg.providers) {
        let providerClass = Provider.load(x.className);
        let provider = new providerClass(...x.args);
        providers.push(provider);
      }
      return providers;
    }
  },

  biddingStrategies: {
    requires: ['cfg'],
    setup: async ({cfg}) => {
      let biddingStrategies = [];
      for (let x of cfg.biddingStrategies) {
        let biddingStrategyClass = BiddingStrategy.load(x.className);
        let biddingStrategy = new biddingStrategyClass(...x.args);
        biddingStrategies.push(biddingStrategy);
      }
      return biddingStrategies;
    }
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
    }
  },

  provisionerservice: {
    requires: ['provisioner'],
    setup: async ({provisioner}) => {
      await provisioner.initiate();
    }
  },

}, ['process', 'profile']);

module.exports = load;

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
