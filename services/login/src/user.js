import taskcluster from 'taskcluster-client'
import _ from 'lodash'
import assert from 'assert'

export default class User {
  constructor() {
    this._mozillianUser = null;
    this.mozillianGroups = [];
    this._ldapUser = null;
    this.ldapGroups = [];
  }

  get mozillianUser() { return this._mozillianUser; }
  get ldapUser() { return this._ldapUser; }

  set mozillianUser(user) {
    if (this._mozillianUser !== user) {
      this._mozillianUser = user;
      this.mozillianGroups = [];
    }
  }

  set ldapUser(user) {
    if (this._ldapUser !== user) {
      this._ldapUser = user;
      this.ldapGroups = [];
    }
  }

  addMozillianGroup(group) {
    if (this.mozillianGroups.indexOf(group) === -1) {
      this.mozillianGroups.push(group);
    }
  }

  addLDAPGroup(group) {
    if (this.ldapGroups.indexOf(group) === -1) {
      this.ldapGroups.push(group);
    }
  }

  hasMozillianUser() { return this._mozillianUser !== null; }
  hasLDAPUser() { return this._ldapUser !== null; }

  scopes() {
    let scopes = [];
    if (this._mozillianUser) {
      scopes.push('assume:mozillians-user:' + this._mozillianUser);
      this.mozillianGroups.forEach(group => {
        scopes.push('assume:mozillians-group:' + group);
      });
    }
    if (this._ldapUser) {
      scopes.push('assume:ldap-user:' + this._ldapUser);
      this.ldapGroups.forEach(group => {
        scopes.push('assume:ldap-group:' + group);
      });
    }
    return scopes;
  }

  createCredentials(options) {
    assert(options);
    let scopes = this.scopes();
    if (scopes.length === 0) {
      return null;
    }
    return taskcluster.createTemporaryCredentials({
      start: taskcluster.fromNow(options.startOffset),
      expiry: taskcluster.fromNow(options.expiry),
      scopes,
      credentials: options.credentials
    });
  }

  /** Serialize user to JSON */
  serialize() {
    return {
      version:          1,
      mozillianUser:    this._mozillianUser,
      mozillianGroups:  this.mozillianGroups,
      ldapUser:         this._ldapUser,
      ldapGroups:       this.ldapGroups,
    };
  }

  /** Load user from JSON */
  static deserialize(data = {}) {
    let user = new User();
    if (data.version === 1) {
      user._mozillianUser = data.mozillianUser;
      user.mozillianGroups = data.mozillianGroups;
      user._ldapUser = data.ldapUser;
      user.ldapGroups = data.ldapGroups;
    }
    return user;
  }

  /** Get user from request */
  static get(req) {
    if (req.user instanceof User) {
      return req.user;
    }
    return new User();
  }
};