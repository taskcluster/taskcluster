import { GraphQLServer } from 'graphql-yoga';
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

const props = () => ({
  typeDefs,
  resolvers,
  context({ request }) {
    const currentClients = clients(request.user);
    const currentLoaders = loaders(currentClients, !!request.user);

    return {
      clients: currentClients,
      loaders: currentLoaders,
    };
  },
});

load(props()).then(() =>
  graphQLServer.start({
    port: process.env.PORT,
    tracing: true,
    cacheControl: true,
  })
);

if (module.hot) {
  module.hot.accept(['./graphql', './resolvers', './loaders'], () => {
    load(props());
  });
}
