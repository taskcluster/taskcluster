#!usr/bin/env node
let loader = require('taskcluster-lib-loader');
let App = require('taskcluster-lib-app');
let monitor = require('taskcluster-lib-monitor');
let debug = require('debug')('events:main');
let config = require('typed-env-config');
let builder = require('./api');
let taskcluster = require('taskcluster-client');
let Listeners = require('./listeners');
let _  = require('lodash');

// Create component loader
let load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => config({profile}),
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => monitor({
      rootUrl: cfg.taskcluster.rootUrl,
      credentials: cfg.taskcluster.credentials,
      projectName: 'taskcluster-events',
      enable: cfg.monitor.enable,
      mock: cfg.monitor.mock, // false in production
      process,
    }),
  },

  listeners : {
    requires: ['cfg'],
    setup : async ({cfg}) => {
      var listeners = new Listeners({
        credentials: cfg.pulse,
      });

      // Start a PulseConnection to add listeners
      await listeners.setup();
      return listeners;
    },
  },

  api : {
    requires: ['cfg', 'monitor', 'listeners'],
    setup : ({cfg, monitor, listeners}) => builder.build({
      rootUrl:  cfg.taskcluster.rootUrl,
      context:  {
        listeners,
      },
      monitor:  monitor.prefix('api'),
    }),
  },

  server: {
    requires: ['cfg', 'monitor', 'api'],
    setup: ({cfg, monitor, api}) => App({
      port: cfg.server.port,
      env: cfg.server.env, // 'development' or 'production'
      forceSSL: cfg.server.forceSSL,
      trustProxy: cfg.server.trustProxy,
      apis: [api],
    }),
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
