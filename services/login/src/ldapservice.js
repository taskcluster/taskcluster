var Promise = require('promise');
var url = require('url');
var assert = require('assert');
var ldap = require('ldapjs');

/** LDAP Service that can lookup POSIX groups on LDAP. */
class LDAPService {
  /**
   * Create LDAP service:
   *
   * options:
   * {
   *   url:       // LDAP server
   *   cert:      // Client side certificate
   *   key:       // Client side key (for certificate)
   *   user:      // Bind user
   *   password:  // Password for bind user
   * }
   */
  constructor(options) {
    assert(options, 'options are required');
    assert(options.url, 'options.url is required');
    assert(options.cert, 'options.cert is required');
    assert(options.key, 'options.key is required');
    assert(options.user, 'options.user is required');
    assert(options.password, 'options.password is required');
    this.options = options;
  }

  async setup() {
    let tlsOptions = {
      cert:   this.options.cert,
      key:    this.options.key,
    };
    let port = url.parse(this.options.url).port;
    if (port) {
      tlsOptions.port = port;
    }

    this.client = ldap.createClient({
      url: this.options.url,
      tlsOptions,
      timeout: 10 * 1000,
      reconnect: true,
    });

    await new Promise((accept, reject) => this.client.bind(
      this.options.user, this.options.password, err => {
      err ? reject(err) : accept();
    }));
  }

  async posixGroups(mail) {
    await new Promise((accept, reject) => this.client.bind(
      this.options.user, this.options.password, err => {
      err ? reject(err) : accept();
    }));

    let res = await new Promise((accept, reject) => this.client.search(
      "dc=mozilla", {
      scope: 'sub',
      filter: '(&(objectClass=posixGroup)(memberUid=' + mail + '))',
      attributes: ['cn'],
      timeLimit: 10,
    }, (err, res) => {
      err ? reject(err) : accept(res);
    }));

    let groups = [];
    await new Promise((accept, reject) => {
      res.on('searchEntry', entry => {
        groups.push(entry.object.cn);
      });
      res.on('error', reject);
      res.on('end', result => {
        if (result.status !== 0) {
          return reject(new Error('LDAP error, got status: ' + result.status));
        }
        return accept();
      });
    });

    return groups;
  }

  async terminate() {
    return new Promise((accept, reject) => {
      this.client.unbind(err => err ? reject(err) : accept());
    });
  }
};

// Export LDAPService
module.exports = LDAPService;