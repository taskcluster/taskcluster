import depthLimit from 'graphql-depth-limit';
import { createComplexityLimitRule } from 'graphql-validation-complexity';
import servers from './servers';
import createContext from './createContext';
import createSchema from './createSchema';
import createSubscriptionServer from './servers/createSubscriptionServer';
import resolvers from './resolvers';
import typeDefs from './graphql';
import PulseEngine from './PulseEngine';

const port = +process.env.PORT || 3050;

process.on('uncaughtException', err => {
  console.error(err); // eslint-disable-line no-console
  process.exit(1);
});

process.on('unhandledRejection', reason => {
  console.error(reason); // eslint-disable-line no-console
});

const pulseEngine = new PulseEngine({
  connection: {
    username: process.env.PULSE_USERNAME,
    password: process.env.PULSE_PASSWORD,
    hostname: process.env.PULSE_HOSTNAME,
    vhost: process.env.PULSE_VHOST,
  },
});
let schema;
let context;
let server;
let app;
let subscriptionServer;
const load = () => {
  schema = createSchema({
    typeDefs,
    resolvers,
    resolverValidationOptions: {
      requireResolversForResolveType: false,
    },
    validationRules: [depthLimit(10), createComplexityLimitRule(1000)],
  });
  context = createContext({ pulseEngine });

  const express = servers({ schema, context, server });

  server = express.server; // eslint-disable-line prefer-destructuring
  app = express.app; // eslint-disable-line prefer-destructuring
  subscriptionServer = createSubscriptionServer({
    server,
    schema,
    context,
    path: '/subscription',
  });
};

load();

server.listen(port, () => {
  /* eslint-disable no-console */
  console.log(`\n\nWeb server running on port ${port}.`);
  console.log(
    `\nOpen the interactive GraphQL Playground and schema explorer in your browser at:
    http://localhost:${port}/playground\n`
  );
  /* eslint-enable no-console */
});

if (module.hot) {
  module.hot.accept(
    [
      './resolvers',
      './graphql',
      './servers/createSubscriptionServer',
      './servers',
    ],
    () => {
      subscriptionServer.close();
      server.removeListener('request', app);
      load();
      server.on('request', app);
    }
  );
}
