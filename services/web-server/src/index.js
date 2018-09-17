import assert from 'assert';
import depthLimit from 'graphql-depth-limit';
import { createComplexityLimitRule } from 'graphql-validation-complexity';
import loader from 'taskcluster-lib-loader';
import config from 'typed-env-config';
import monitor from 'taskcluster-lib-monitor';
import { createServer as httpServer } from 'http';
import createApp from './servers/createApp';
import createContext from './createContext';
import createSchema from './createSchema';
import createSubscriptionServer from './servers/createSubscriptionServer';
import resolvers from './resolvers';
import typeDefs from './graphql';
import PulseEngine from './PulseEngine';

const load = loader(
  {
    cfg: {
      requires: ['profile'],
      setup: ({ profile }) => {
        const cfg = config({ profile });

        // apply some sanity-checks
        assert(cfg.server.port, 'config server.port is required');
        assert(
          cfg.taskcluster.rootUrl,
          'config taskcluster.rootUrl is required'
        );

        return cfg;
      },
    },

    monitor: {
      requires: ['cfg'],
      setup: ({ cfg }) =>
        monitor({
          rootUrl: cfg.taskcluster.rootUrl,
          projectName: cfg.monitoring.project,
          credentials: cfg.taskcluster.credentials,
          mock: cfg.monitoring.mock,
          enable: cfg.monitoring.enable,
        }),
    },

    pulseEngine: {
      requires: ['cfg', 'monitor'],
      setup: ({ cfg, monitor }) =>
        new PulseEngine({
          ...cfg.taskcluster,
          ...cfg.pulse,
          monitor,
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
      requires: ['cfg', 'pulseEngine'],
      setup: ({ cfg, pulseEngine }) =>
        createContext({
          pulseEngine,
          rootUrl: cfg.taskcluster.rootUrl,
        }),
    },

    app: {
      requires: ['cfg', 'context', 'schema'],
      setup: ({ cfg, context, schema }) => createApp({ cfg, schema, context }),
    },

    server: {
      requires: ['app', 'schema', 'context'],
      setup: ({ app, schema, context }) => {
        const server = httpServer(app);

        createSubscriptionServer({
          server, // this attaches itself directly to the server
          schema,
          context,
          path: '/subscription',
        });

        return server;
      },
    },

    devServer: {
      requires: ['cfg', 'server'],
      setup: async ({ cfg, server }) => {
        await new Promise(resolve => server.listen(cfg.server.port, resolve));

        /* eslint-disable no-console */
        console.log(`\n\nWeb server running on port ${cfg.server.port}.`);
        console.log(
          `\nOpen the interactive GraphQL Playground and schema explorer in your browser at:
        http://localhost:${cfg.server.port}/playground\n`
        );
        /* eslint-enable no-console */
      },
    },
  },
  ['profile', 'process']
);

if (!module.parent) {
  load('devServer', {
    process: 'devServer',
    profile: process.env.NODE_ENV || 'development',
  }).catch(err => {
    console.log(err.stack); // eslint-disable-line no-console
    process.exit(1);
  });
}
