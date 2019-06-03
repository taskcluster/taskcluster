/**
 * UserSessions are immutable -- when anything about the session changes,
 * a new instance should replace the old.
 *
 * Common properties are:
 * - identityProviderId -- the provider identifier
 * - profile --  the user profile object
 * - accessToken -- the OAuth2 access token
 * - providerExpires -- the expiration date time of the provider's access token
 * - credentials -- the Taskcluster credentials (with or without a certificate)
 */
export default class UserSession {
  constructor(options) {
    Object.assign(this, options);

    // Make UserSession immutable
    Object.freeze(this);
  }

  static create(options) {
    return new UserSession(options);
  }

  static deserialize(value) {
    return new UserSession(JSON.parse(value));
  }

  serialize() {
    return JSON.stringify(this);
  }
}
