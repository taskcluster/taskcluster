const { CLIENT_ID_PATTERN } = require('../utils/constants');

/**
 * Returns the user's identity given a clientId
 * Examples:
 *    mozilla-auth0/ad|Mozilla-LDAP|haali/ -> mozilla-auth0/ad|Mozilla-LDAP|haali
 *    mozilla-auth0/ad|Mozilla-LDAP|haali -> mozilla-auth0/ad|Mozilla-LDAP|haali
 */
module.exports = (clientId) => {
  const patternMatch = CLIENT_ID_PATTERN.exec(clientId);

  return patternMatch && patternMatch[1];
};
