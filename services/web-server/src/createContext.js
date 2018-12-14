import clients from './clients';
import loaders from './loaders';

export default ({ pulseEngine, rootUrl }) => ({ req, connection }) => {
  if (req) {
    const currentClients = clients({
      credentials: req.credentials,
      rootUrl,
    });
    const currentLoaders = loaders(
      currentClients,
      Boolean(req.credentials),
      rootUrl
    );

    return {
      clients: currentClients,
      loaders: currentLoaders,
    };
  }

  if (connection) {
    // if connection is set, this is for a subscription
    return {
      pulseEngine,
      // subscriptions do not need credentials (all public data)
      clients: clients({ rootUrl }),
    };
  }

  return {};
};
