const assert = require('assert');
const depthLimit = require('graphql-depth-limit');
const { createComplexityLimitRule } = require('graphql-validation-complexity');
const loader = require('taskcluster-lib-loader');
const config = require('taskcluster-lib-config');
const libReferences = require('taskcluster-lib-references');
const { createServer } = require('http');
const { Client, pulseCredentials } = require('taskcluster-lib-pulse');
const { ApolloServer } = require('apollo-server-express');
const monitorManager = require('./monitor');
const createApp = require('./servers/createApp');
const formatError = require('./servers/formatError');
const createContext = require('./createContext');
const createSchema = require('./createSchema');
const createSubscriptionServer = require('./servers/createSubscriptionServer');
const resolvers = require('./resolvers');
const typeDefs = require('./graphql');
const PulseEngine = require('./PulseEngine');
const scanner = require('./login/scanner');
const { Auth } = require('taskcluster-client');

const load = loader(
  {
    cfg: {
      requires: ['profile'],
      setup: ({ profile }) => config({ profile }),
    },

    monitor: {
      requires: ['cfg', 'profile', 'process'],
      setup: ({ cfg, profile, process }) =>
        monitorManager.setup({
          processName: process,
          verify: profile !== 'production',
          ...cfg.monitoring,
        }),
    },

    pulseClient: {
      requires: ['cfg', 'monitor'],
      setup: ({ cfg, monitor }) => {
        if (!cfg.pulse.namespace) {
          assert(
            process.env.NODE_ENV !== 'production',
            'cfg.pulse.namespace is required'
          );

          return null;
        }

        return new Client({
          monitor: monitor.childMonitor('pulse-client'),
          namespace: 'taskcluster-web-server',
          credentials: pulseCredentials(cfg.pulse),
        });
      },
    },

    pulseEngine: {
      requires: ['pulseClient', 'monitor'],
      setup: ({ pulseClient, monitor }) =>
        new PulseEngine({
          pulseClient,
          monitor: monitor.childMonitor('pulse-engine'),
        }),
    },

    schema: {
      requires: [],
      setup: () =>
        createSchema({
          typeDefs,
          resolvers,
          resolverValidationOptions: {
            requireResolversForResolveType: false,
          },
          validationRules: [depthLimit(10), createComplexityLimitRule(1000)],
        }),
    },

    context: {
      requires: ['cfg', 'pulseEngine', 'strategies', 'monitor'],
      setup: ({ cfg, pulseEngine, strategies, monitor }) =>
        createContext({
          pulseEngine,
          rootUrl: cfg.taskcluster.rootUrl,
          strategies,
          cfg,
          monitor: monitor.childMonitor('context'),
        }),
    },

    generateReferences: {
      requires: ['cfg'],
      setup: ({cfg}) => libReferences.fromService({
        references: [monitorManager.reference()],
      }).generateReferences(),
    },

    app: {
      requires: ['cfg', 'strategies'],
      setup: ({ cfg, strategies }) => createApp({ cfg, strategies }),
    },

    httpServer: {
      requires: ['app', 'schema', 'context'],
      setup: ({ app, schema, context }) => {
        const server = new ApolloServer({
          schema,
          context,
          formatError,
          tracing: true,
        });
        const httpServer = createServer(app);

        server.applyMiddleware({
          app,
          // Prevent apollo server to overwrite what we already have for cors
          cors: false,
        });

        createSubscriptionServer({
          server: httpServer, // this attaches itself directly to the server
          schema,
          context,
          path: '/subscription',
        });

        return httpServer;
      },
    },

    // Login strategies
    strategies: {
      requires: ['cfg'],
      setup: ({ cfg }) => {
        const strategies = {};

        Object.keys(cfg.login.strategies || {}).forEach((name) => {
          const Strategy = require('./login/strategies/' + name);
          strategies[name] = new Strategy({ name, cfg });
        });

        return strategies;
      },
    },

    scanner: {
      requires: ['cfg', 'strategies', 'monitor'],
      setup: async ({ cfg, strategies, monitor }, ownName) => {
        const auth = new Auth({
          credentials: cfg.taskcluster.credentials,
          rootUrl: cfg.taskcluster.rootUrl,
        });
        return monitor.oneShot(ownName, () => scanner(auth, strategies));
      },
    },

    devServer: {
      requires: ['cfg', 'httpServer'],
      setup: async ({ cfg, httpServer }) => {
        // apply some sanity-checks
        assert(cfg.server.port, 'config server.port is required');
        assert(
          cfg.taskcluster.rootUrl,
          'config taskcluster.rootUrl is required'
        );

        await new Promise(resolve => httpServer.listen(cfg.server.port, resolve));

        /* eslint-disable no-console */
        console.log(`\n\nWeb server running on port ${cfg.server.port}.`);
        if (cfg.app.playground) {
          console.log(
            `\nOpen the interactive GraphQL Playground and schema explorer in your browser at:
          http://localhost:${cfg.server.port}/playground\n`
          );
        }
        if (!cfg.pulse.namespace) {
          console.log(
            `\nNo Pulse namespace defined; no Pulse messages will be received.\n`
          );
        }
        /* eslint-enable no-console */
      },
    },

    server: {
      requires: ['cfg', 'httpServer'],
      setup: async ({ cfg, httpServer }) => {
        await new Promise(resolve => httpServer.listen(cfg.server.port, resolve));
      },
    },
  },
  {
    // default to 'devServer' since webpack does not pass any command-line args
    // when running in development mode
    profile: process.env.NODE_ENV || 'development',
    process: process.argv[2] || 'devServer',
  }
);

if (!module.parent) {
  load.crashOnError(process.argv[2] || 'devServer');
}

module.exports = load;
