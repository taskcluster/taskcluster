const assert = require('assert');
const WebServerError = require('./WebServerError');

module.exports = async ({ cfg, strategy, identity, monitor }) => {
  [cfg, strategy, identity, monitor].map(assert.ok);

  // Don't report much to the user, to avoid revealing sensitive information, although
  // it is likely in the service logs.
  const credentialError = new WebServerError('InputError', 'Could not generate credentials for this user');

  if (!strategy) {
    throw credentialError;
  }

  const user = await strategy.userFromIdentity(identity);

  if (!user) {
    monitor.debug(`Could not find user with identity ${identity}`);
    throw credentialError;
  }

  // Create and return temporary credentials, limiting expires to a max of 15 minutes
  const { credentials: issuer, temporaryCredentials: { startOffset } } = cfg.taskcluster;
  const { credentials: userCredentials, expires } = user.createCredentials({
    // issuer
    credentials: issuer,
    startOffset,
    expiry: '15 minutes',
  });

  // Move expires back by 30 seconds to ensure the user refreshes well in advance of the
  // actual credential expiration time
  expires.setSeconds(expires.getSeconds() - 30);

  monitor.log.createCredentials({
    clientId: userCredentials.clientId,
    expires,
    userIdentity: user.identity,
  });

  return {
    credentials: userCredentials,
    expires,
  };
};
