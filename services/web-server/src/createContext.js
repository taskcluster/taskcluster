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
      Boolean(request.credentials),
      rootUrl
    );

    return {
      clients: currentClients,
      loaders: currentLoaders,
    };
  } else if (connection) {
    // if connection is set, this is for a subscription
    return {
      pulseEngine,
      // subscriptions do not need credentials (all public data)
      clients: clients({ rootUrl }),
    };
  }

  return {};
};
