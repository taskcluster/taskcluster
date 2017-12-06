var _           = require('lodash');
var assert      = require('assert');
var taskcluster = require('taskcluster-client');
var events      = require('events');
var debug       = require('debug')('auth:ScopeResolver');
var Promise     = require('promise');
var {scopeCompare, mergeScopeSets, normalizeScopeSet} = require('taskcluster-lib-scopes');
var {generateTrie, executeTrie} = require('./trie');

const ASSUME_PREFIX = /^(:?(:?|a|as|ass|assu|assum|assum|assume)\*$|assume:)/;
const PARAMETERIZED_SCOPE = /^(:?|a|as|ass|assu|assum|assum|assume|assume:.*)<\.\.>/;
const PARAMETER = /<\.\.\>/;
const PARAMETER_G = /<\.\.\>/g;
const PARAMETER_TO_END = /<\.\.>.*/;

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
    //    expires: new Date(),          // The client's expiration timestamp
    //    expandedScopes: [...],        // Scopes (including indirect scopes)
    //    updateLastUsed: true | false  // true, if lastUsed should be updated
    // }
    this._clients = [];
    // List of role objects on the form:
    // {roleId: '...', scopes: [...]}
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
    assert(options.Client, 'Expected options.Client');
    assert(options.Role, 'Expected options.Role');
    assert(options.exchangeReference, 'Expected options.exchangeReference');
    assert(options.connection instanceof taskcluster.PulseConnection,
      'Expected options.connection to be a PulseConnection object');
    this._Client        = options.Client;
    this._Role          = options.Role;
    this._options       = options;

    // Create authEvents client
    var AuthEvents = taskcluster.createClient(this._options.exchangeReference);
    var authEvents = new AuthEvents();

    // Create PulseListeners
    this._clientListener = new taskcluster.PulseListener({
      connection:   options.connection,
      reconnect:    true,
    });
    this._roleListener = new taskcluster.PulseListener({
      connection:   options.connection,
      reconnect:    true,
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
          disabled:         client.disabled,
        });
      }
      this._rebuildResolver();
    });
  }

  reloadRole(roleId) {
    return this._syncReload(async () => {
      let role = await this._Role.load({roleId}, true);
      // Always remove it
      this._roles = this._roles.filter(r => r.roleId !== roleId);
      // If a role was loaded add it back
      if (role) {
        this._roles.push({roleId: role.roleId, scopes: role.scopes});
      }
      this._rebuildResolver();
    });
  }

  reload() {
    return this._syncReload(async () => {
      debug('Loading clients and roles');

      // Load clients and roles in parallel
      let clients = [];
      let roles   = [];
      await Promise.all([
        // Load all clients on a simplified form:
        // {clientId, accessToken, updateLastUsed}
        // _rebuildResolver() will construct the `_clientCache` object
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
              disabled:         client.disabled,
            });
          },
        }),
        // Load all roles on a simplified form: {roleId, scopes}
        this._Role.scan({}, {
          handler(role) {
            roles.push({roleId: role.roleId, scopes: role.scopes});
          },
        }),
      ]);

      // Set _roles and _clients at the same time and immediately call
      // _rebuildResolver, so anyone using the cache is using a consistent one
      this._roles = roles;
      this._clients = clients;
      this._rebuildResolver();
    });
  }

  /**
   * Verify that the existing set of roles, plus the given role (or without it if
   * scopes is undefined), is valid.  If not, this will raise an informative exception.
   */
  checkUpdatedRole(roleId, scopes) {
    let roles = _.clone(this._roles);
    // Always remove it
    roles = roles.filter(r => r.roleId !== roleId);
    // If a role was loaded add it back
    if (scopes) {
      roles.push({roleId, scopes});
    }

    ScopeResolver.cycleCheck(roles);
  }

  /** Compute fixed point over this._roles, and construct _clientCache */
  _rebuildResolver() {
    this._resolver = this.buildResolver(this._roles);

    // Construct client cache
    this._clientCache = {};
    for (let client of this._clients) {
      var scopes = this.resolve(client.unexpandedScopes);
      client.scopes = scopes; // for createSignatureValidator compatibility
      client.expandedScopes = scopes;
      this._clientCache[client.clientId] = client;
    }
  }

  /**
   * Throw an informative exception if this set of roles has a cycle that would
   * lead to unbounded role expansion.
   *
   * Such a cycle must contain *only* parameterized expansions (`..*` ->
   * `assume:..<..>..`).  Any non-parameterized expansions in a cycle would
   * always produce the same expansion, resulting in a fixed point.
   */
  static cycleCheck(roles) {
    let paramRules = [];

    // find the set of parameterized rules and strip * and parameters from them
    let roleIds = roles.map(({roleId}) => roleId);
    roles.forEach(({roleId, scopes}) => {
      if (!roleId.endsWith('*')) {
        return;
      }
      roleId = roleId.slice(0, -1);
      scopes.forEach(scope => {
        if (!PARAMETERIZED_SCOPE.test(scope)) {
          return;
        }
        // strip `assume:` and any parameters
        scope = scope.replace(PARAMETER_TO_END, '').slice(7);
        paramRules.push({roleId, scope});
      });
    });

    // turn those into edges, with an edge wherever r is a prefix of s or s is a prefix of r
    let edges = {};
    for (let {roleId: roleId1, scope: scope1} of paramRules) {
      for (let {roleId: roleId2} of paramRules) {
        if (scope1.startsWith(roleId2) || roleId2.startsWith(scope1)) {
          if (edges[roleId1]) {
            edges[roleId1].push(roleId2);
          } else {
            edges[roleId1] = [roleId2];
          }
        }
      }
    }

    // Use depth-first searches from each node to find any cycles in the edges collected above.
    // The graph may not be connected, so we must start from each node, but once we have visited
    // a node we need not start there again
    let done = new Set();
    _.keys(edges).forEach(start => {
      let seen = [];
      let visit = roleId => {
        if (done.has(start)) {
          return;
        }
        if (seen.indexOf(roleId) !== -1) {
          return seen.slice(seen.indexOf(roleId)).concat([roleId]);
        }
        seen.push(roleId);
        for (let edge of edges[roleId] || []) {
          let cycle = visit(edge);
          if (cycle) {
            return cycle;
          }
        }
        done.add(seen.pop());
      };

      let cycle = visit(start);
      if (cycle) {
        throw new Error(`Found cycle in roles: ${cycle.map(c => `${c}*`).join(' -> ')}`);
      }
    });
  };

  /**
   * Build a resolver which, given a set of scopes, will return the expanded
   * set of scopes based on the given roles.  Roles are an array of elements
   * {roleId, scopes}.
   */
  buildResolver(roles) {
    ScopeResolver.cycleCheck(roles);

    // encode the roles as rules, including the `assume:` prefix, and marking up
    // the expansions of any parameterized scopes as {scope, index}, where index
    // is the index in the input at which the replacement begins (the index of
    // the `*`)

    let rules = roles.map(({roleId, scopes}) => ({pattern: `assume:${roleId}`, scopes}));
    let dfa = generateTrie(rules);

    return (inputs) => {
      inputs.sort(scopeCompare);
      // seen is the normalied scopeset we have seen already
      let seen = normalizeScopeSet(inputs);
      // queue is the list of scopes to expand (so only expandable scopes)
      let queue = seen.filter(s => ASSUME_PREFIX.test(s));

      // insert a new scope into the `seen` scopeset, returning false if it was
      // already satisfied by the scopeset.  This is equivalent to `seen =
      // mergeScopeSets(seen, [scope])`, then returning false if seen is not
      // changed.
      let see = (scope) => {
        const n = seen.length;
        const trailingStar = scope.endsWith('*');
        const prefix = scope.slice(0, -1);
        let i = 0;
        while (i < n) {
          let seenScope = seen[i];
          // if seenScope satisfies scope, we're done
          if (scope === seenScope || seenScope.endsWith('*') && scope.startsWith(seenScope.slice(0, -1))) {
            return false;
          }

          // if we've found where to insert this scope, do so and splice out any existing scopes
          // that this one satisfies
          if (scopeCompare(seenScope, scope) > 0) {
            let j = i;
            if (trailingStar) {
              while (j < n && seen[j].startsWith(prefix)) {
                j++;
              }
            }
            seen.splice(i, j - i, scope);
            return true;
          }

          i++;
        }

        // we fell off the end of `seen`, so add this new scope at the end
        seen.push(scope);
        return true;
      };

      let i = 0;
      while (i < queue.length) {
        let scope = queue[i++];

        // execute the DFA and expand any parameterizations in the result, then add
        // the newly expanded scopes to the list of scopes to expand (recursively)
        const trailingStar = scope.endsWith('*');
        executeTrie(dfa, scope).forEach((expansion, k) => {
          if (!expansion) {
            return;
          }

          // Get the replacement slice for any parameterization. If this is empty and the
          // scope ended with `*`, consider that `*` to have been extended into the
          // replacement.
          const slice = scope.slice(k) || (trailingStar ? '*' : '');
          const parameter_regexp = trailingStar ? PARAMETER_TO_END : PARAMETER_G;

          expansion.map(s => s.replace(parameter_regexp, slice)).forEach(s => {
            // mark this scope as seen, and if it is novel and expandable, add it
            // to the queue for expansion
            if (see(s) && ASSUME_PREFIX.test(s)) {
              queue.push(s);
            }
          });
        });
      }

      return seen;
    };
  };

  /**
   * Return a normalized set of scopes that `scopes` can be expanded to when
   * assuming all authorized roles.
   */

  resolve(scopes) {
    return this._resolver(scopes);
  }

  async loadClient(clientId) {
    let client = this._clientCache[clientId];
    if (!client) {
      throw new Error('Client with clientId \'' + clientId + '\' not found');
    }
    if (client.disabled) {
      throw new Error('Client with clientId \'' + clientId + '\' is disabled');
    }
    if (client.expires < new Date()) {
      throw new Error('Client with clientId: \'' + clientId + '\' has expired');
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
}

// Export ScopeResolver
module.exports = ScopeResolver;
