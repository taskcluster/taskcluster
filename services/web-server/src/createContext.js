import clients from './clients';
import loaders from './loaders';

export default ({ pulseEngine, rootUrl, handlers, cfg }) => ({ req, connection }) => {
  if (req) {
    const { credentials } = req;
    const currentClients = clients({
      credentials: req.credentials,
      rootUrl,
    });
    const currentLoaders = loaders(
      currentClients,
      Boolean(credentials),
      rootUrl,
      handlers,
      credentials,
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
