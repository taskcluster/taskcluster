import clients from './clients';
import loaders from './loaders';

export default ({ pulseEngine }) => ({ request, connection }) => {
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
};
