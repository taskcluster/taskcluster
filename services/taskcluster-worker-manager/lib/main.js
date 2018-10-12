const loader = require('taskcluster-lib-loader');
const App = require('taskcluster-lib-app');
const monitor = require('taskcluster-lib-monitor');
const config = require('typed-env-config');
const SchemaSet = require('taskcluster-lib-validate');
const builder = require('./api');

const {InMemoryDatastore} = require('./data-storage');

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
      return new InMemoryDatastore();
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
    setup: async ({cfg, schemaset, monitor, workerConfigs}) => builder.build({
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
