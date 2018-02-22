import graphql from 'express-graphql';
import schema from './graphql';
import loaders from './loaders';
import clients from './clients';

export default () => (request, response, next) => {
  const currentClients = clients(request.user);
  const currentLoaders = loaders(currentClients);

  return graphql({
    schema,
    graphiql: process.env.NODE_ENV !== 'production',
    context: {
      clients: currentClients,
      loaders: currentLoaders,
    },
  })(request, response, next);
};
