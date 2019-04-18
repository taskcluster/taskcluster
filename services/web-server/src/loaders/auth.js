import DataLoader from 'dataloader';
import WebServerError from '../utils/WebServerError';

export default (clients, isAuthed, rootUrl, handlers, credentialsFromRequest, cfg) => {
  const oidcCredentials = new DataLoader(queries => {
    return Promise.all(
      queries.map(async provider => {
        const handler = handlers[provider];
        const user = handler.userFromClientId(credentialsFromRequest.clientId);

        if (!user) {
          // Don't report much to the user, to avoid revealing sensitive information, although
          // it is likely in the service logs.
          throw new WebServerError('InputError', 'Could not generate credentials for this access token');
        }

        // Create and return temporary credentials, limiting expires to a max of 15 minutes
        const { credentials: issuer, startOffset } = cfg.taskcluster.temporaryCredentials;
        const { credentials: userCredentials, expires } = user.createCredentials({
          // issuer
          credentials: issuer,
          startOffset,
          expiry: '15 minutes',
        });

        return {
          credentials: userCredentials,
          expires,
        };
      })
    );
  });

  return {
    oidcCredentials,
  };
};
