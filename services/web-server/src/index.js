import { GraphQLServer, PubSub } from 'graphql-yoga';
import compression from 'compression';
import jwt from './jwt';
import credentials from './credentials';
import typeDefs from './graphql';
import resolvers from './resolvers';
import loaders from './loaders';
import clients from './clients';

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

const emitter = new PubSub();
const props = () => ({
  typeDefs,
  resolvers,
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
        emitter,
        clients: clients(connection.user, emitter),
      };
    }

    return {};
  },
});

load(props()).then(() => {
  graphQLServer.start({
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
});

if (module.hot) {
  module.hot.accept(['./graphql', './resolvers', './loaders'], () => {
    load(props());
  });
}
