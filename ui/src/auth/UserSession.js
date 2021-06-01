/**
 * UserSessions are immutable -- when anything about the session changes,
 * a new instance should replace the old.
 *
 * Common properties are:
 * - identityProviderId -- the provider identifier
 * - profile --  the user profile object
 * - expires -- the expiration date time of the Taskcluster access token
 * - credentials -- the Taskcluster credentials (with or without a certificate)
 */
export default class UserSession {
  constructor(options) {
    Object.assign(this, options);

    // Make UserSession immutable
    Object.freeze(this);
  }

  static create(options) {
    let { encodedProfile } = options;

    if (encodedProfile) {
      encodedProfile = JSON.parse(atob(encodedProfile));

      return new UserSession({ ...options, profile: encodedProfile });
    }

    return new UserSession(options);
  }

  static deserialize(value) {
    return new UserSession(JSON.parse(value));
  }

  serialize() {
    return JSON.stringify(this);
  }
}
