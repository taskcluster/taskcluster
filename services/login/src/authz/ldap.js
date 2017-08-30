import assert from 'assert';
import LDAPClient from '../ldap';
import Debug from 'debug';

var debug = Debug('LDAPAuthorizer');

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
   *   allowedGroups: // groups to reflect into roles, or 'all'
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

    this.identityProviders = ['mozilla-ldap'];
  }

  async setup() {
  }

  async rolesForUser(email) {
  }

  async authorize(user) {
    // only trust ldap-authenticated identities
    if (user.identityProviderId !== 'mozilla-ldap') {
      return;
    }
    let email = user.identityId;

    user.addRole('mozilla-user:' + email);

    debug(`ldap authorizing ${user.identity}`);

    let addRolesForEntries = (entries) => {
      entries.forEach((entry) => {
        let group = entry.object.cn;
        debug('..found', group);

        // This is unlikely, and probably forbidden in LDAP, but just in case, let's
        // avoid characters that have special meanings in scopes.
        if (group.endsWith('*')) {
          debug('    rejecting, as it ends with *');
          return;
        }

        if (this.allowedGroups === 'all' || this.allowedGroups.indexOf(group) !== -1) {
          user.addRole('mozilla-group:' + group);
        } else {
          debug(`    rejecting, as it is not in allowedGroups (${JSON.stringify(this.alloewdGroups)})`);
        }
      });
    };

    await this.client.operate(async (client) => {
      debug(`enumerating scm groups for ${email}`);
      // always perform a bind, in case the client has disconnected
      // since this connection was last used.
      await client.bind(this.user, this.password);

      // SCM groups are posixGroup objects with the email in the memberUid
      // field.  This code does not capture other POSIX groups (which have the
      // user's uid field in the memberUid field).
      addRolesForEntries(await client.search(
        'dc=mozilla', {
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
        'dc=mozilla', {
          scope: 'sub',
          filter: '(&(objectClass=groupOfNames)(member=' + userDn + '))',
          attributes: ['cn'],
          timeLimit: 10,
        }));
    });
  }
};

module.exports = LDAPAuthorizer;
