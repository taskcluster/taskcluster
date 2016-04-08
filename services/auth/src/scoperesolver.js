var _           = require('lodash');
var assert      = require('assert');
var taskcluster = require('taskcluster-client');
var events      = require('events');
var base        = require('taskcluster-base');
var debug       = require('debug')('auth:ScopeResolver');
var Promise     = require('promise');
var dfa         = require('./dfa');

class ScopeResolver extends events.EventEmitter {
  /** Create ScopeResolver */
  constructor(options = {}) {
    super();

    // Provide default options
    options = _.defaults({}, options, {
      // Maximum time that lastUsed must be behind, must always be negative
      maxLastUsedDelay: '-6h',
    });
    this._maxLastUsedDelay = options.maxLastUsedDelay;
    assert(/^ *-/.test(options.maxLastUsedDelay),
           'maxLastUsedDelay must be negative');

    // List of client objects on the form:
    // {
    //    clientId, accessToken,
    //    unexpandedScopes:             // Scopes (as set in the table)
    //    disabled: true | false,       // If true, client is disabled
    //    scopes: [...],                // Scopes (including indirect scopes)
    //    expandedScopes: [...],        // Scopes (including indirect scopes)
    //    updateLastUsed: true | false  // true, if lastUsed should be updated
    // }
    this._clients = [];
    // List of role objects on the form:
    // {roleId: '...', scopes: [...], expandedScopes: [...]}
    this._roles = [];

    // Mapping from clientId to client objects from _clients,
    // _clientCache[clientId] === this._clients[i] === {     // for some i
    //   clientId, accessToken, expandedScopes: [...], updateLastUsed
    // };
    this._clientCache = {};

    // Promise that we're done reloading, used to serialize reload operations
    this._reloadDone = Promise.resolve();
  }

  /**
   * Load cache, setup interval for reloading cache, start listening
   *
   * options:
   * {
   *   Client:              // data.Client object
   *   Role:                // data.Role object
   *   connection:          // PulseConnection object
   *   exchangeReference:   // reference for exchanges declared
   *   cacheExpiry:         // Time before clearing cache
   * }
   */
  async setup(options) {
    options = _.defaults({}, options || {}, {
      cacheExpiry:    20 * 60 * 1000,   // default to 20 min
    });
    assert(options.Client, "Expected options.Client");
    assert(options.Role, "Expected options.Role");
    assert(options.exchangeReference, "Expected options.exchangeReference");
    assert(options.connection instanceof taskcluster.PulseConnection,
           "Expected options.connection to be a PulseConnection object");
    this._Client        = options.Client;
    this._Role          = options.Role;
    this._options       = options;

    // Create authEvents client
    var AuthEvents = taskcluster.createClient(this._options.exchangeReference);
    var authEvents = new AuthEvents();

    // Create PulseListeners
    this._clientListener = new taskcluster.PulseListener({
      connection:   options.connection,
      reconnect:    true
    });
    this._roleListener = new taskcluster.PulseListener({
      connection:   options.connection,
      reconnect:    true
    });

    // listen for client events
    await this._clientListener.bind(authEvents.clientCreated());
    await this._clientListener.bind(authEvents.clientUpdated());
    await this._clientListener.bind(authEvents.clientDeleted());
    // listen for role events
    await this._roleListener.bind(authEvents.roleCreated());
    await this._roleListener.bind(authEvents.roleUpdated());
    await this._roleListener.bind(authEvents.roleDeleted());

    // Reload when we get message
    this._clientListener.on('message', m => {
      return this.reloadClient(m.payload.clientId);
    });
    this._roleListener.on('message', m => {
      return this.reloadRole(m.payload.roleId);
    });

    // Load initially
    await this.reload();

    // Set this.reload() to run repeatedly
    this._reloadIntervalHandle = setInterval(() => {
      this.reload().catch(err => this.emit('error', err));
    }, this._options.cacheExpiry);

    // Start listening
    await this._clientListener.resume();
    await this._roleListener.resume();
  }

  /**
   * Execute async `reloader` function, after any earlier async `reloader`
   * function given this function has completed. Ensuring that the `reloader`
   * functions are executed in serial.
   */
  _syncReload(reloader) {
    return this._reloadDone = this._reloadDone.catch(() => {}).then(reloader);
  }

  reloadClient(clientId) {
    return this._syncReload(async () => {
      let client = await this._Client.load({clientId}, true);
      // Always remove it
      this._clients = this._clients.filter(c => c.clientId !== clientId);
      // If a client was loaded, add it back
      if (client) {
        // For reasoning on structure, see reload()
        let lastUsedDate = new Date(client.details.lastDateUsed);
        let minLastUsed = taskcluster.fromNow(this._maxLastUsedDelay);
        this._clients.push({
          clientId:         client.clientId,
          accessToken:      client.accessToken,
          expires:          client.expires,
          updateLastUsed:   lastUsedDate < minLastUsed,
          unexpandedScopes: client.scopes,
          disabled:         client.disabled
        });
      }
      this._computeFixedPoint();
    });
  }

  reloadRole(roleId) {
    return this._syncReload(async () => {
      let role = await this._Role.load({roleId}, true);
      // Always remove it
      this._roles = this._roles.filter(r => r.roleId !== roleId);
      // If a role was loaded add it back
      if (role) {
        let scopes = role.scopes;
        if (!role.roleId.endsWith('*')) {
          // For reasoning on structure, see reload()
          scopes = _.union(scopes, ['assume:' + role.roleId]);
        }
        this._roles.push({roleId: role.roleId, scopes});
      }
      this._computeFixedPoint();
    });
  }

  reload() {
    return this._syncReload(async () => {
      debug("Loading clients and roles");

      // Load clients and roles in parallel
      let clients = [];
      let roles   = [];
      await Promise.all([
        // Load all clients on a simplified form:
        // {clientId, accessToken, updateLastUsed}
        // _computeFixedPoint() will construct the `_clientCache` object
        this._Client.scan({}, {
          handler: client => {
            let lastUsedDate = new Date(client.details.lastDateUsed);
            let minLastUsed = taskcluster.fromNow(this._maxLastUsedDelay);
            clients.push({
              clientId:         client.clientId,
              accessToken:      client.accessToken,
              expires:          client.expires,
              // Note that lastUsedDate should be updated, if it's out-dated by
              // more than 6 hours.
              // (cheap way to know if it's been used recently)
              updateLastUsed:   lastUsedDate < minLastUsed,
              unexpandedScopes: client.scopes,
              disabled:         client.disabled
            });
          }
        }),
        // Load all roles on a simplified form: {roleId, scopes}
        // _computeFixedPoint() will later add the `expandedScopes` property
        this._Role.scan({}, {
          handler(role) {
            let scopes = role.scopes;
            if (!role.roleId.endsWith('*')) {
              // Ensure identity, if role isn't a prefix pattern. Obviously,
              // 'assume:ab' which matches 'assume:a*' doesn't have 'assume:a*'
              // by the identity relation. But for non-prefix patterns, the
              // identify relation implies that you have 'assume:<roleId>'.
              // This speeds up fixed-point computation, and means that if you
              // have a match without any *, then you can look up the role, and
              // not have to worry about any prefix patterns that may also match
              // as they are already saturated.
              scopes = _.union(scopes, ['assume:' + role.roleId]);
            }
            roles.push({roleId: role.roleId, scopes});
          }
        })
      ]);

      // Set _roles and _clients at the same time and immediately call
      // _computeFixedPoint, so anyone using the cache is using a consistent one
      this._roles = roles;
      this._clients = clients;
      this._computeFixedPoint();
    });
  }

  /** Compute fixed point over this._roles, and construct _clientCache */
  _computeFixedPoint() {
    //console.time("_computeFixedPoint");
    this._resolver = dfa.computeFixedPoint(this._roles);
    //console.timeEnd("_computeFixedPoint");

    // Construct client cache
    this._clientCache = {};
    for (let client of this._clients) {
      var scopes = this.resolve(client.unexpandedScopes);
      client.scopes = scopes; // for createSignatureValidator compatibility
      client.expandedScopes = scopes;
      this._clientCache[client.clientId] = client;
    }
  }

  /** Update lastDateUsed for a clientId */
  async _updateLastUsed(clientId) {
    let client = await this._Client.load({clientId});
    await client.modify(client => {
      let lastUsedDate = new Date(client.details.lastDateUsed);
      let minLastUsed = taskcluster.fromNow(this._maxLastUsedDelay);
      if (lastUsedDate < minLastUsed) {
        client.details.lastDateUsed = new Date().toJSON();
      }
    });
  }

  /**
   * Return a normalized set of scopes that `scopes` can be expanded to when
   * assuming all authorized roles.
   */

  resolve(scopes) {
    // use mergeScopeSets to eliminate any redundant scopes in the input (which will
    // cause redundant scopes in the output)
    let granted = dfa.mergeScopeSets(dfa.sortScopesForMerge(_.clone(scopes)), []);
    for (let scope of scopes) {
      let found = this._resolver(scope);
      if (found.length > 0) {
        granted = dfa.mergeScopeSets(granted, found);
      }
    }
    return granted;
  }

  async loadClient(clientId) {
    let client = this._clientCache[clientId];
    if (!client) {
      throw new Error("Client with clientId '" + clientId + "' not found");
    }
    if (client.disabled) {
      throw new Error("Client with clientId '" + clientId + "' is disabled");
    }
    if (client.expires < new Date()) {
      throw new Error("Client with clientId: '" + clientId + "' has expired");
    }

    if (client.updateLastUsed) {
      client.updateLastUsed = false;
      this._updateLastUsed(clientId).catch(err => this.emit('error', err));
    }
    return client;
  }

  /**
   * Remove scopes that aren't needed, e.g. if you have ["q:1", "q:*"], then
   * the scope-set ["q:*"] is the formal-form. Basically shorter, but same
   * level of authority.
   */
  static normalizeScopes(scopes) {
    //return scopes;
    // Filter out any duplicate scopes (so we only have unique strings)
    scopes = _.uniq(scopes);
    // Filter out scopes that are covered by some other scope
    return scopes.filter(scope => {
      return scopes.every(other => {
        // If `scope` is `other`, then we can't filter it! It has to be
        // strictly greater than (otherwise scopes would filter themselves)
        if (other === scope) {
          return true;
        }
        // But if the other one ends with '*' and `scope` starts with its
        // prefix then `other` is strictly greater than `scope` and we filter
        // out `scope`.
        return !(other.endsWith('*') && scope.startsWith(other.slice(0, -1)));
      });
    });
  }

  /**
   * Determine if scope grants a roleId, and allows owner to assume the role.
   * This is equivalent to: `scopeMatch([["assume:" + roleId]], scopes)`
   */
  static grantsRole(scope, roleId) {
    // We have 3 rules (A), (B) and (C) by which a scope may match a role.
    // This implementation focuses on being reasonably fast by avoiding
    // allocations whenever possible.

    // Rule (A) and (B) both requires the scope to start with "assume:"
    if (scope.startsWith('assume:')) {
      // A) We have scope = 'assume:<roleId>', so we can assume the role
      if (scope.length === roleId.length + 7 && scope.endsWith(roleId)) {
        return true;
      }

      // B) role is on the form 'assume:<prefix>*' and we have a scope on the
      //    form 'assume:<prefix>...'. This is special rule, assigning
      //    special meaning to '*' when used at the end of a roleId.
      if (roleId.endsWith('*') && scope.slice(7).startsWith(roleId.slice(0, -1))) {
        return true;
      }

      // C) We have scope as 'assume:<prefix>*' and '<prefix>' is a prefix of
      // roleId, this is similar to rule (A) relying on the normal scope
      // satisfiability. Note, this is only half of role (C).
      if (scope.endsWith('*') && roleId.startsWith(scope.slice(7, -1))) {
        return true;
      }
    }

    // C) We have scope as '<prefix>*' and '<prefix>' is a prefix of 'assume',
    // then similar to rule (A) relying on the normal scope satisfiability we
    // have that any role is granted.
    if (scope.endsWith('*') && 'assume'.startsWith(scope.slice(0, -1))) {
      return true;
    }

    return false;
  }
}

// Export ScopeResolver
module.exports = ScopeResolver;
