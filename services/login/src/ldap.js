const url = require('url');
const ldap = require('ldapjs');
const _ = require('lodash');
const Debug = require('debug');

var debug = Debug('LDAPClient');

class LDAPClient {
  constructor(cfg) {
    let tlsOptions = {
      cert:   cfg.cert,
      key:    cfg.key,
    };
    let port = url.parse(cfg.url).port;
    if (port) {
      tlsOptions.port = port;
    }

    this.client = null;
    this.createClientArgs = {
      url: cfg.url,
      tlsOptions,
      timeout: 10 * 1000,
      reconnect: true,
    };

    /* This promise acts as a lock; pending = locked, fulfilled = unlocked.  It
     * is never rejected. */
    this.lock = Promise.resolve();
  }

  /** To perform a set of operations bound as a particular user, retrying in
   * the face of failure, call this method with a function that begins by
   * calling this.bind.  No other use of the connection will be permitted while
   * those operations are in progress, so the connection cannot be re-bound.
   * The client is passed to the operations function.  You can call other
   * methods of this client from there.
   */
  async operate(operations, tries) {
    let attempts = 0;
    tries = tries || 5;
    while (true) {
      attempts++;
      try {
        if (!this.client) {
          this.client = ldap.createClient(this.createClientArgs);
        }

        /* do a little dance here to make sure that we see exceptions inside
         * this promise, but the lock promise is not rejected */
        await new Promise((accept, reject) => {
          this.lock = this.lock
            .then(() => operations(this))
            .then(accept, reject);
        });
        break;
      } catch (err) {
        if (attempts >= tries) {
          debug('error performing LDAP operation; failing', err);
          throw err;
        } else {
          debug('error performing LDAP operation; retrying (with fresh connection)', err);
          this.client = null;
        }
      }
    }
  }

  bind(user, password) {
    debug(`bind(${user}, <password>)`);
    return new Promise((accept, reject) => this.client.bind(
      user, password, err => {
        err ? reject(err) : accept();
      }));
  }

  async search(base, options) {
    debug(`search(${base}, ${JSON.stringify(options)})`);
    let entries = [];
    let res = await new Promise((accept, reject) => this.client.search(
      base, options, (err, res) => {
        err ? reject(err) : accept(res);
      }));
    return await new Promise((accept, reject) => {
      res.on('searchEntry', entry => {
        entries.push(entry);
      });
      res.on('error', (err) => {
        reject(err);
      });
      res.on('end', result => {
        if (result.status !== 0) {
          return reject(new Error('LDAP error, got status: ' + result.status));
        }
        return accept(entries);
      });
    });
  }

  async dnForEmail(email) {
    debug(`dnForEmail(${email})`);
    let userDn;
    let entries = await this.search(
      'dc=mozilla', {
        scope: 'sub',
        filter: '(&(objectClass=inetOrgPerson)(mail=' + email + '))',
        attributes: [],
        timeLimit: 10,
      });
    if (entries && entries.length === 1) {
      return entries[0].object.dn;
    }
  }
}

module.exports = LDAPClient;
