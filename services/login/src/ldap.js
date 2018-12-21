var url = require('url');
var ldap = require('ldapjs');
var _ = require('lodash');
var debug = require('debug')('LDAPClient');

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

    this.client = ldap.createClient({
      url: cfg.url,
      tlsOptions,
      timeout: 10 * 1000,
      reconnect: true,
    });

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
          debug("error performing LDAP operation; failing", err);
          throw err;
        } else {
          debug("error performing LDAP operation; retrying", err);
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

  search(base, options) {
    debug(`search(${base}, ${JSON.stringify(options)})`);
    let entries = [];
    return new Promise((accept, reject) => this.client.search(
      base, options, (err, res) => {
      err ? reject(err) : accept(res);
    })).then((res) => {
      return new Promise((accept, reject) => {
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
    });
  }

  dnForEmail(email) {
    debug(`dnForEmail(${email})`);
    let userDn;
    return this.search(
      "dc=mozilla", {
      scope: 'sub',
      filter: '(&(objectClass=inetOrgPerson)(mail=' + email + '))',
      attributes: [],
      timeLimit: 10,
    }).then((entries) => {
      if (entries && entries.length === 1) {
        return entries[0].object.dn;
      }
    });
  }
}

module.exports = LDAPClient;
