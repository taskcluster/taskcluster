import depthLimit from 'graphql-depth-limit';
import { createComplexityLimitRule } from 'graphql-validation-complexity';
import loader from 'taskcluster-lib-loader';
import { createServer as httpServer } from 'http';
import createApp from './servers/createApp';
import createContext from './createContext';
import createSchema from './createSchema';
import createSubscriptionServer from './servers/createSubscriptionServer';
import resolvers from './resolvers';
import typeDefs from './graphql';
import PulseEngine from './PulseEngine';

const port = +process.env.PORT || 3050;

[
  'PULSE_USERNAME',
  'PULSE_PASSWORD',
  'PULSE_HOSTNAME',
  'PULSE_VHOST',
  'TASKCLUSTER_ROOT_URL',
  'TASKCLUSTER_CLIENT_ID',
  'TASKCLUSTER_ACCESS_TOKEN',
  'PUBLIC_URL',
].forEach(env => {
  if (!(env in process.env)) {
    throw new Error(`Missing required environment variable "${env}"`);
  }
});

const load = loader({
  pulseEngine: {
    requires: [],
    setup: () =>
      new PulseEngine({
        connection: {
          username: process.env.PULSE_USERNAME,
          password: process.env.PULSE_PASSWORD,
          hostname: process.env.PULSE_HOSTNAME,
          vhost: process.env.PULSE_VHOST,
        },
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
    requires: ['pulseEngine'],
    setup: ({ pulseEngine }) => createContext({ pulseEngine }),
  },

  app: {
    requires: ['context', 'schema'],
    setup: ({ context, schema }) => createApp({ schema, context }),
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
    requires: ['server'],
    setup: async ({ server }) => {
      await new Promise(resolve => server.listen(port, resolve));

      /* eslint-disable no-console */
      console.log(`\n\nWeb server running on port ${port}.`);
      console.log(
        `\nOpen the interactive GraphQL Playground and schema explorer in your browser at:
        http://localhost:${port}/playground\n`
      );
      /* eslint-enable no-console */
    },
  },
});

if (!module.parent) {
  load('devServer').catch(err => {
    console.log(err.stack); // eslint-disable-line no-console
    process.exit(1);
  });
}
