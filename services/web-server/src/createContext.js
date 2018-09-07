import clients from './clients';
import loaders from './loaders';

export default ({ pulseEngine, rootUrl }) => ({ request, connection }) => {
  if (request) {
    const currentClients = clients({
      credentials: request.credentials,
      rootUrl,
    });
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
