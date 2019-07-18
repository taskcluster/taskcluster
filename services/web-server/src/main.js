const debug = require('debug')('app:main');
const assert = require('assert');
const depthLimit = require('graphql-depth-limit');
const { createComplexityLimitRule } = require('graphql-validation-complexity');
const loader = require('taskcluster-lib-loader');
const config = require('taskcluster-lib-config');
const libReferences = require('taskcluster-lib-references');
const { createServer } = require('http');
const { Client, pulseCredentials } = require('taskcluster-lib-pulse');
const { ApolloServer } = require('apollo-server-express');
const { sasCredentials } = require('taskcluster-lib-azure');
const taskcluster = require('taskcluster-client');
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
const Session = require('./entities/Session');

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
          namespace: cfg.pulse.namespace,
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
      requires: ['cfg', 'pulseEngine', 'strategies', 'monitor', 'Session'],
      setup: ({ cfg, pulseEngine, strategies, monitor, Session }) =>
        createContext({
          pulseEngine,
          rootUrl: cfg.taskcluster.rootUrl,
          strategies,
          cfg,
          monitor: monitor.childMonitor('context'),
          Session,
        }),
    },

    generateReferences: {
      requires: ['cfg'],
      setup: ({cfg}) => libReferences.fromService({
        references: [monitorManager.reference()],
      }).generateReferences(),
    },

    app: {
      requires: ['cfg', 'strategies', 'Session'],
      setup: ({ cfg, strategies, Session }) => createApp({ cfg, strategies, Session }),
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

        server.applyMiddleware({ app });

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

    Session: {
      requires: ['cfg', 'monitor'],
      setup: ({cfg, monitor}) => Session.setup({
        tableName: cfg.azure.tableName,
        monitor: monitor.childMonitor('table.sessions'),
        credentials: sasCredentials({
          accountId: cfg.azure.accountId,
          accountKey: cfg.azure.accountKey,
          tableName: cfg.azure.tableName,
          rootUrl: cfg.taskcluster.rootUrl,
          credentials: cfg.taskcluster.credentials,
        }),
      }),
    },

    'expire-sessions': {
      requires: ['cfg', 'Session', 'monitor'],
      setup: ({cfg, Session, monitor}) => {
        return monitor.oneShot('expire-sessions', async () => {
          const delay = cfg.app.sessionExpirationDelay;
          const now = taskcluster.fromNow(delay);

          debug('Expiring sessions');
          const count = await Session.expire(now);
          debug('Expired ' + count + ' sessions');
        });
      },
    },

    scanner: {
      requires: ['cfg', 'strategies', 'monitor'],
      setup: async ({ cfg, strategies, monitor }) => {
        return monitor.oneShot('scanner', () => scanner(cfg, strategies));
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
