var Promise = require('promise');
var url = require('url');
var assert = require('assert');
var ldap = require('ldapjs');
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

    this.allowedGroups = options.cfg.ldap.allowedGroups;
    this.ldap_cfg = options.cfg.ldap;
  }

  async setup() {
    let tlsOptions = {
      cert:   this.ldap_cfg.cert,
      key:    this.ldap_cfg.key,
    };
    let port = url.parse(this.ldap_cfg.url).port;
    if (port) {
      tlsOptions.port = port;
    }

    this.client = ldap.createClient({
      url: this.ldap_cfg.url,
      tlsOptions,
      timeout: 10 * 1000,
      reconnect: true,
    });

    await new Promise((accept, reject) => this.client.bind(
      this.ldap_cfg.user, this.ldap_cfg.password, err => {
      err ? reject(err) : accept();
    }));
  }

  async authorize(user) {
    // only trust sso-authenticated identities
    if (user.identityProviderId !== "sso") {
      return;
    }
    let email = user.identityId;

    debug(`ldap authorizing ${user.identity}`);

    await new Promise((accept, reject) => this.client.bind(
      this.ldap_cfg.user, this.ldap_cfg.password, err => {
      err ? reject(err) : accept();
    }));

    let addRolesForQuery = (res) => {
      return new Promise((accept, reject) => {
        res.on('searchEntry', entry => {
          let group = entry.object.cn;
          debug("..found", group);
          if (this.allowedGroups.indexOf(group) !== -1) {
            user.addRole('mozilla-group:' + group);
          }
        });
        res.on('error', reject);
        res.on('end', result => {
          if (result.status !== 0) {
            return reject(new Error('LDAP error, got status: ' + result.status));
          }
          return accept();
        });
      });
    };

    debug(`enumerating posix groups for ${email}`);
    await addRolesForQuery(await new Promise((accept, reject) => this.client.search(
      "dc=mozilla", {
      scope: 'sub',
      filter: '(&(objectClass=posixGroup)(memberUid=' + email + '))',
      attributes: ['cn'],
      timeLimit: 10,
    }, (err, res) => {
      err ? reject(err) : accept(res);
    })));

    // convert mail to a DN to search for LDAP groups
    let res = await new Promise((accept, reject) => this.client.search(
      "dc=mozilla", {
      scope: 'sub',
      filter: '(&(objectClass=inetOrgPerson)(mail=' + email + '))',
      attributes: [],
      timeLimit: 10,
    }, (err, res) => {
      err ? reject(err) : accept(res);
    }));
    let userDn;
    await new Promise((accept, reject) => {
      res.on('searchEntry', entry => {
        userDn = entry.object.dn;
      });
      res.on('error', reject);
      res.on('end', result => {
        if (result.status !== 0) {
          return reject(new Error('LDAP error, got status: ' + result.status));
        }
        return accept();
      });
    });
    if (!userDn) {
      debug(`no user found for ${email}; skipping LDAP groups`);
      return;
    }

    debug(`enumerating LDAP groups for ${userDn}`);
    await addRolesForQuery(await new Promise((accept, reject) => this.client.search(
      "dc=mozilla", {
      scope: 'sub',
      filter: '(&(objectClass=groupOfNames)(member=' + userDn + '))',
      attributes: ['cn'],
      timeLimit: 10,
    }, (err, res) => {
      err ? reject(err) : accept(res);
    })));
  }
};

module.exports = LDAPAuthorizer;
