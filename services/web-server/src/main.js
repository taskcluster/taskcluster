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
const { Auth } = require('taskcluster-client');
const monitorManager = require('./monitor');
const createApp = require('./servers/createApp');
const formatError = require('./servers/formatError');
const createContext = require('./createContext');
const createSchema = require('./createSchema');
const createSubscriptionServer = require('./servers/createSubscriptionServer');
const resolvers = require('./resolvers');
const typeDefs = require('./graphql');
const PulseEngine = require('./PulseEngine');
const AuthorizationCode = require('./data/AuthorizationCode');
const AccessToken = require('./data/AccessToken');
const GithubAccessToken = require('./data/GithubAccessToken');
const scanner = require('./login/scanner');

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
      requires: ['cfg', 'strategies', 'AuthorizationCode', 'AccessToken', 'auth', 'monitor'],
      setup: ({ cfg, strategies, AuthorizationCode, AccessToken, auth, monitor }) =>
        createApp({ cfg, strategies, AuthorizationCode, AccessToken, auth, monitor }),
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
      requires: ['cfg', 'GithubAccessToken', 'monitor'],
      setup: ({ cfg, GithubAccessToken, monitor }) => {
        const strategies = {};

        Object.keys(cfg.login.strategies || {}).forEach((name) => {
          const Strategy = require('./login/strategies/' + name);
          const options = { name, cfg, monitor };

          if (name === 'github') {
            Object.assign(options, { GithubAccessToken });
          }

          strategies[name] = new Strategy(options);
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

    auth: {
      requires: ['cfg'],
      setup: ({ cfg }) => new taskcluster.Auth(cfg.taskcluster),
    },

    AuthorizationCode: {
      requires: ['cfg', 'monitor'],
      setup: ({cfg, monitor}) => AuthorizationCode.setup({
        tableName: 'AuthorizationCodesTable',
        monitor: monitor.childMonitor('table.authorizationCodes'),
        credentials: sasCredentials({
          accountId: cfg.azure.accountId,
          tableName: 'AuthorizationCodesTable',
          rootUrl: cfg.taskcluster.rootUrl,
          credentials: cfg.taskcluster.credentials,
        }),
        signingKey: cfg.azure.signingKey,
      }),
    },

    AccessToken: {
      requires: ['cfg', 'monitor'],
      setup: ({cfg, monitor}) => AccessToken.setup({
        tableName: 'AccessTokenTable',
        monitor: monitor.childMonitor('table.accessTokenTable'),
        credentials: sasCredentials({
          accountId: cfg.azure.accountId,
          tableName: 'AccessTokenTable',
          rootUrl: cfg.taskcluster.rootUrl,
          credentials: cfg.taskcluster.credentials,
        }),
        signingKey: cfg.azure.signingKey,
        cryptoKey: cfg.azure.cryptoKey,
      }),
    },

    GithubAccessToken: {
      requires: ['cfg', 'monitor'],
      setup: ({cfg, monitor}) => GithubAccessToken.setup({
        tableName: 'GithubAccessTokenTable',
        monitor: monitor.childMonitor('table.githubAccessTokenTable'),
        credentials: sasCredentials({
          accountId: cfg.azure.accountId,
          tableName: 'GithubAccessTokenTable',
          rootUrl: cfg.taskcluster.rootUrl,
          credentials: cfg.taskcluster.credentials,
        }),
        signingKey: cfg.azure.signingKey,
        cryptoKey: cfg.azure.cryptoKey,
      }),
    },

    'cleanup-expire-auth-codes': {
      requires: ['cfg', 'AuthorizationCode', 'monitor'],
      setup: ({cfg, AuthorizationCode, monitor}) => {
        return monitor.oneShot('cleanup-expire-authorization-codes', async () => {
          const delay = cfg.app.authorizationCodeExpirationDelay;
          const now = taskcluster.fromNow(delay);

          debug('Expiring authorization codes');
          const count = await AuthorizationCode.expire(now);
          debug('Expired ' + count + ' authorization codes');
        });
      },
    },

    'cleanup-expire-access-tokens': {
      requires: ['cfg', 'AccessToken', 'monitor'],
      setup: ({cfg, AccessToken, monitor}) => {
        return monitor.oneShot('cleanup-expire-access-tokens', async () => {
          const delay = cfg.app.authorizationCodeExpirationDelay;
          const now = taskcluster.fromNow(delay);

          debug('Expiring access tokens');
          const count = await AccessToken.expire(now);
          debug('Expired ' + count + ' access tokens');
        });
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
