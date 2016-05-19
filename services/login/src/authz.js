/**
 * The authorizer is responsible for taking User objects that only have
 * an identity set, and adding a collection of roles based on that
 * identity.  This is done by means of a set of plugins in the `authz`
 * directory and named in the configuration.
 */
export default class Authorizer {
  constructor(cfg) {
    this. authorizers = cfg.app.authorizers.map((name) => {
      return new (require('./authz/' + name))({cfg});
    });
  }

  async setup() {
    await Promise.all(this.authorizers.map(authz => authz.setup()));
  }

  /**
   * Authorize the given user, calling user.addRole for all roles
   * linked to user.identity.
   */
  async authorize(user) {
    /* invoke all authorizers which recognize this identityProviderId */
    return Promise.all(this.authorizers.map(authz => {
      if (authz.identityProviders.indexOf(user.identityProviderId) !== -1) {
        return authz.authorize(user)
      }
    }));
  }

  /**
   * A list of identity providers for which this authorizer is responsible
   */
  get identityProviders() {
    return this.authorizers
      .map(authz => authz.identityProviders)
      .reduce((a,b) => a.concat(b));
  }
}
