import { GraphQLServer } from '@eliperelman/graphql-yoga';
import depthLimit from 'graphql-depth-limit';
import { createComplexityLimitRule } from 'graphql-validation-complexity';
import compression from 'compression';
import jwt from './jwt';
import credentials from './credentials';
import typeDefs from './graphql';
import resolvers from './resolvers';
import loaders from './loaders';
import clients from './clients';
import PulseEngine from './PulseEngine';

process.on('uncaughtException', err => {
  console.error(err); // eslint-disable-line no-console
  process.exit(1);
});

process.on('unhandledRejection', reason => {
  console.error(reason); // eslint-disable-line no-console
});

let graphQLServer;
const load = async props => {
  if (!graphQLServer) {
    graphQLServer = new GraphQLServer(props);
  } else {
    await graphQLServer.reload(() => props);
  }

  graphQLServer.express.use(
    jwt({
      jwksUri: process.env.JWKS_URI,
      issuer: process.env.JWT_ISSUER,
    })
  );
  graphQLServer.express.use(
    credentials({
      url: process.env.LOGIN_URL,
    })
  );
  graphQLServer.express.use(compression());
};

const pulseEngine = new PulseEngine({
  connection: {
    username: process.env.PULSE_USERNAME,
    password: process.env.PULSE_PASSWORD,
  },
});
const props = () => ({
  typeDefs,
  resolvers,
  validationRules: [depthLimit(10), createComplexityLimitRule(1000)],
  context({ request, connection }) {
    if (request) {
      const currentClients = clients(request.user);
      const currentLoaders = loaders(currentClients, !!request.user);

      return {
        clients: currentClients,
        loaders: currentLoaders,
      };
    } else if (connection) {
      return {
        pulseEngine,
        clients: clients(connection.user),
      };
    }

    return {};
  },
});

load(props()).then(async () => {
  await graphQLServer.start({
    apolloEngineKey: process.env.APOLLO_ENGINE_KEY,
    port: process.env.PORT,
    tracing: true,
    cacheControl: true,
    subscriptions: {
      path: '/',
      onConnect(params, socket) {
        // This way lies madness with Express middleware
        // and web sockets with external middleware
        return new Promise(resolve => {
          jwt({
            jwksUri: process.env.JWKS_URI,
            issuer: process.env.JWT_ISSUER,
            socket: {
              params,
              socket,
            },
            next(request) {
              credentials({
                url: process.env.LOGIN_URL,
              })(request, null, () => {
                resolve(request);
              });
            },
          })();
        });
      },
    },
  });

  /* eslint-disable no-console */
  console.log(
    `\n\nTaskcluster GraphQL server running on port ${process.env.PORT}.`
  );
  console.log(
    `\nOpen the interactive GraphQL Playground and schema explorer in your browser at:
    http://localhost:${process.env.PORT}\n`
  );
  /* eslint-enable no-console */
});

if (module.hot) {
  module.hot.accept(['./graphql', './resolvers', './loaders'], () => {
    load(props());
  });
}
