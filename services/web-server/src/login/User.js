const taskcluster = require('taskcluster-client');
const assert = require('assert');

class User {
  constructor() {
    this._identity = null;
    this.roles = [];
  }

  get identity() {
    return this._identity;
  }

  set identity(identity) {
    this._identity = identity;
    // always reset roles when changing identity
    this.roles = [];
  }

  get identityId() {
    return this._identity.split('/')
      .slice(1)
      .join('|');
  }

  addRole(...roles) {
    assert(this._identity !== undefined);

    for (const role of roles) {
      if (!this.roles.includes(role)) {
        this.roles.push(role);
      }
    }
  }

  scopes() {
    let scopes = this.roles.map(role => 'assume:' + role);
    // the `login-identity:*` role defines what each user gets access to.
    scopes.push(`assume:login-identity:${this.identity}`);

    return scopes;
  }

  createCredentials(options) {
    assert(options);

    if (!this.identity) {
      return {credentials: null, expires: null};
    }

    const scopes = this.scopes();
    // take the soonest expiry
    let expires = taskcluster.fromNow(options.expiry);
    if (this.expires && this.expires < expires) {
      expires = this.expires;
    }

    return {
      expires,
      credentials: taskcluster.createTemporaryCredentials({
        clientId: this.identity,
        start: taskcluster.fromNow(options.startOffset),
        expiry: expires,
        scopes,
        credentials: options.credentials,
      }),
    };
  }

  /** Get user from request */
  static get(req) {
    if (req.user instanceof User) {
      return req.user;
    }

    return new User();
  }
}

module.exports = User;
