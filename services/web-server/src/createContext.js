import clients from './clients';
import loaders from './loaders';

export default ({ pulseEngine, rootUrl, strategies, cfg }) => ({ req, connection }) => {
  if (req) {
    const currentClients = clients({
      credentials: req.credentials,
      rootUrl,
    });
    const currentLoaders = loaders(
      currentClients,
      Boolean(req.credentials),
      rootUrl,
      strategies,
      req,
      cfg,
    );

    return {
      clients: currentClients,
      loaders: currentLoaders,
    };
  }

  if (connection) {
    // subscriptions do not need credentials (all public data)
    const currentClients = clients({ rootUrl });
    const currentLoaders = loaders(
      currentClients,
      false,
      rootUrl
    );
    // if connection is set, this is for a subscription
    return {
      pulseEngine,
      clients: currentClients,
      loaders: currentLoaders,
    };
  }

  return {};
};
