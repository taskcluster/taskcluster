var Promise = require('promise');
var assert = require('assert');
var LDAPClient = require('./../ldap');
var debug = require('debug')('LDAPAuthorizer');

/* Determine appropriate roles based on Mozilla LDAP group membership */
class LDAPAuthorizer {
  /**
   * Create LDAP authorizer
   *
   * config (options.cfg.ldap):
   *   url:           // LDAP server
   *   cert:          // Client side certificate
   *   key:           // Client side key (for certificate)
   *   user:          // Bind user
   *   password:      // Password for bind user
   *   allowedGroups: // groups to reflect into roles
   */
  constructor(options) {
    assert(options, 'options are required');
    assert(options.cfg, 'options.cfg is required');
    assert(options.cfg.ldap, 'options.cfg.ldap is required');
    assert(options.cfg.ldap.url, 'options.cfg.ldap.url is required');
    assert(options.cfg.ldap.cert, 'options.cfg.ldap.cert is required');
    assert(options.cfg.ldap.key, 'options.cfg.ldap.key is required');
    assert(options.cfg.ldap.user, 'options.cfg.ldap.user is required');
    assert(options.cfg.ldap.password, 'options.cfg.ldap.password is required');
    assert(options.cfg.ldap.allowedGroups, 'options.cfg.ldap.allowedGroups is required');

    this.user = options.cfg.ldap.user;
    this.password = options.cfg.ldap.password;
    this.client = new LDAPClient(options.cfg.ldap);
    this.allowedGroups = options.cfg.ldap.allowedGroups;
  }

  async setup() {
  }

  async authorize(user) {
    // only trust ldap-authenticated identities
    if (user.identityProviderId !== "mozilla-ldap") {
      return;
    }
    let email = user.identityId;

    debug(`ldap authorizing ${user.identity}`);

    let addRolesForEntries = (entries) => {
      entries.forEach((entry) => {
        let group = entry.object.cn;
        debug("..found", group);
        if (this.allowedGroups.indexOf(group) !== -1) {
          user.addRole('mozilla-group:' + group);
        }
      });
    };

    // always perform a bind, in case the client has disconnected
    // since this connection was last used.
    await this.client.bind(this.user, this.password, async (client) => {
      debug(`enumerating scm groups for ${email}`);
      // SCM groups are posixGroup objects with the email in the memberUid
      // field.  This code does not capture other POSIX groups (which have the
      // user's uid field in the memberUid field).
      addRolesForEntries(await client.search(
        "dc=mozilla", {
        scope: 'sub',
        filter: '(&(objectClass=posixGroup)(memberUid=' + email + '))',
        attributes: ['cn'],
        timeLimit: 10,
      }));

      let userDn = await client.dnForEmail(email);
      if (!userDn) {
        debug(`no user found for ${email}; skipping LDAP groups`);
        return;
      }

      debug(`enumerating LDAP groups for ${userDn}`);
      addRolesForEntries(await client.search(
        "dc=mozilla", {
        scope: 'sub',
        filter: '(&(objectClass=groupOfNames)(member=' + userDn + '))',
        attributes: ['cn'],
        timeLimit: 10,
      }));
    });
  }
};

module.exports = LDAPAuthorizer;
