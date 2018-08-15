import clients from './clients';
import loaders from './loaders';

export default ({ pulseEngine }) => ({ request, connection }) => {
  if (request) {
    const currentClients = clients(request.credentials);
    const currentLoaders = loaders(
      currentClients,
      Boolean(request.credentials)
    );

    return {
      clients: currentClients,
      loaders: currentLoaders,
    };
  } else if (connection) {
    return {
      pulseEngine,
      clients: clients(connection.credentials),
    };
  }

  return {};
};
