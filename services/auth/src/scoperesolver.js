import _ from 'lodash';
import util from 'util';
import assert from 'assert';
import taskcluster from 'taskcluster-client';
import events from 'events';
import LRU from 'quick-lru';
import debugFactory from 'debug';
const debug = debugFactory('auth:ScopeResolver');
import * as trie from './trie.js';
import ScopeSetBuilder from './scopesetbuilder.js';
import { consume } from 'taskcluster-lib-pulse';

const ASSUME_PREFIX = /^(:?(:?|a|as|ass|assu|assum|assum|assume)\*$|assume:)/;

/** ZeroCache is an LRU cache instance that contains nothing for caching is disabled */
const ZeroCache = {
  get: (k) => null,
  set: (k, v) => null,
};

class ScopeResolver extends events.EventEmitter {
  /** Create ScopeResolver */
  constructor(options = {}) {
    super();

    // Provide default options
    options = _.defaults({}, options, {
      // Maximum time that lastUsed must be behind, must always be negative
      maxLastUsedDelay: '-6h',
      disableCache: false, // useful for performance measurement
    });
    this._maxLastUsedDelay = options.maxLastUsedDelay;
    assert(options.monitor, 'expected an instance of taskcluster-lib-monitor');
    assert(/^ *-/.test(options.maxLastUsedDelay),
      'maxLastUsedDelay must be negative');

    this._monitor = options.monitor;
    this.db = options.db;

    this._disableCache = options.disableCache;

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
    // {role_id: '...', scopes: [...]}
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
   *   rootUrl:             // a Taskcluster rootUrl
   *   db:                  // tc-lib-postgres Database
   *   pulseClient:         // tc-lib-pulse Client
   *   exchangeReference:   // reference for exchanges declared
   *   cacheExpiry:         // Time before clearing cache
   * }
   */
  async setup(options) {
    options = _.defaults({}, options || {}, {
      cacheExpiry: 20 * 60 * 1000, // default to 20 min
    });
    assert(options.exchangeReference, 'Expected options.exchangeReference');
    assert(options.pulseClient, 'Expected options.pulseClient');
    assert(options.rootUrl, 'Expected options.rootUrl');

    await this.reloadOnNotifications(options);

    // Load initial data before startup completes..
    await this.reload();

    // Set this.reload() to run repeatedly
    this._reloadIntervalHandle = setInterval(() => {
      this.reload().catch(err => this.emit('error', err));
    }, options.cacheExpiry);
  }

  async stop() {
    await this._clientPq.stop();
    await this._rolePq.stop();
  }

  /**
   * Reload clients, roles, or both on notifications of changes via pulse.
   */
  async reloadOnNotifications({ exchangeReference, pulseClient, rootUrl }) {
    const AuthEvents = taskcluster.createClient(exchangeReference);
    const authEvents = new AuthEvents({ rootUrl: rootUrl });

    // This is a perfect use-case for ephemeral consumers: every process that
    // runs a ScopeResolver should have its own queue, so that it gets it own
    // copy of each message; and those queues should be cleaned up when
    // processes go away.  The price we pay for this is that when we reconnect
    // to pulse, we may have missed messages, so we must reload all clients and
    // roles.

    this._clientPq = await consume({
      client: pulseClient,
      ephemeral: true,
      bindings: [
        authEvents.clientCreated(),
        authEvents.clientUpdated(),
        authEvents.clientDeleted(),
      ],
      onConnected: () => this.reload(),
      handleMessage: m => this.reloadClient(m.payload.clientId),
    });
    this._rolePq = await consume({
      client: pulseClient,
      ephemeral: true,
      bindings: [
        authEvents.roleCreated(),
        authEvents.roleUpdated(),
        authEvents.roleDeleted(),
      ],
      // no need for both _clientPq and _rolePq to call this.reload()
      // for the same reconnection..
      onConnected: () => {},
      handleMessage: m => this.reloadRoles(),
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
      const [client] = await this.db.fns.get_client(clientId);
      // Always remove it
      this._clients = this._clients.filter(c => c.clientId !== clientId);
      // If a client was loaded, add it back
      if (client) {
        // For reasoning on structure, see reload()
        let minLastUsed = taskcluster.fromNow(this._maxLastUsedDelay);
        this._clients.push({
          clientId: client.client_id,
          accessToken: this.db.decrypt({ value: client.encrypted_access_token }),
          expires: client.expires,
          updateLastUsed: client.last_date_used < minLastUsed,
          unexpandedScopes: client.scopes,
          disabled: client.disabled,
        });
      }
      this._rebuildResolver(this._roles, this._clients);
    });
  }

  reloadRoles() {
    return this._syncReload(async () => {
      let roles = await this.db.fns.get_roles();
      this._rebuildResolver(roles, this._clients);
    });
  }

  reload() {
    return this._syncReload(async () => {
      debug('Loading clients and roles');

      // Load clients and roles in parallel
      let clients = [];
      let roles = [];
      await Promise.all([
        (async () => {
          // Load all clients on a simplified form:
          // {clientId, accessToken, updateLastUsed}
          // _rebuildResolver() will construct the `_clientCache` object
          let offset = 0;
          while (true) {
            const rows = await this.db.fns.get_clients(null, 1000, offset);
            if (rows.length === 0) {
              break;
            } else {
              offset += 1000;
            }

            let minLastUsed = taskcluster.fromNow(this._maxLastUsedDelay);
            for (const client of rows) {
              clients.push({
                clientId: client.client_id,
                accessToken: this.db.decrypt({ value: client.encrypted_access_token }).toString('utf8'),
                expires: client.expires,
                // Note that lastUsedDate should be updated, if it's out-dated by
                // more than 6 hours.
                // (cheap way to know if it's been used recently)
                updateLastUsed: client.last_date_used < minLastUsed,
                unexpandedScopes: client.scopes,
                disabled: client.disabled,
              });
            }
          }
        })(),
        (async () => {
          roles = await this.db.fns.get_roles();
        })(),
      ]);

      // Set _roles and _clients at the same time and immediately call
      // _rebuildResolver, so anyone using the cache is using a consistent one
      this._rebuildResolver(roles, clients);
    });
  }

  /** Compute fixed point over this._roles, and construct _clientCache */
  _rebuildResolver(roles, clients) {
    this._resolver = this.buildResolver(roles);

    // set this._roles, this._clients only after the resolver is successfully
    // constructed, so there are no cycles, etc.
    this._roles = roles;
    this._clients = clients;

    // Construct client cache
    this._clientCache = {};
    for (let client of this._clients) {
      client.scopes = null;
      client.expandedScopes = null;
      this._clientCache[client.clientId] = client;
    }
  }

  /**
   * Throws an error with a human readable message and code: 'InvalidScopeError'
   * or 'DependencyCycleError', if any of the roles are illegal, or form a cycle.
   */
  static validateRoles(roles = []) {
    const rules = roles.map(({ role_id, scopes }) => ({ pattern: `assume:${role_id}`, scopes }));
    trie.dependencyOrdering(rules);
  }

  /**
   * Build a resolver which, given a set of scopes, will return the expanded
   * set of scopes based on the given roles.  Roles are an array of elements
   * {role_id, scopes}.
   */
  buildResolver(roles = []) {
    const rules = roles.map(({ role_id, scopes }) => ({ pattern: `assume:${role_id}`, scopes }));
    const node = trie.optimize(trie.withPrefix(trie.build(rules), 'assume:'));

    // LRU of resolved scope-sets, to increase probability of hits, we shall
    // omit all input scopes that doesn't match ASSUME_PREFIX (ie. match 'assume:')
    const lru = this._disableCache ? ZeroCache : new LRU({ maxSize: 10000 });

    return (inputs) => {
      inputs = ScopeSetBuilder.normalizeScopeSet(inputs);
      // Reduce input to the set of scopes starting with 'assume:'
      const queue = inputs.filter(s => ASSUME_PREFIX.test(s));

      // Check if we have an expansion of queue in LRU cache, if there is no
      // such expansion we'll continue and compute one.
      const cacheKey = queue.join('\n');
      const cacheResult = lru.get(cacheKey);

      if (cacheResult) {
        return ScopeSetBuilder.mergeScopeSets(cacheResult, inputs);
      }

      // Build expansion of queue
      const result = new ScopeSetBuilder();
      for (const scope of queue) {
        const input = scope.startsWith('assume:') ? scope.slice(7) : '*';
        trie.execute(node, input, result);
      }
      // Store result in cache
      const scopes = result.scopes();
      lru.set(cacheKey, scopes);

      return ScopeSetBuilder.mergeScopeSets(scopes, inputs);
    };
  }

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
      await this.db.fns.update_client_last_used(clientId);
    }

    // Lazily expand client scopes
    if (client.scopes === null) {
      let scopes = this.resolve(client.unexpandedScopes);
      client.scopes = scopes; // for createSignatureValidator compatibility
      client.expandedScopes = scopes;
    }

    // We must clone the client because it is modified in place to reset
    // `client.scopes` in `_rebuildResolver`.
    // Note that if `client` ever grows any fields that are themselves
    // objects, we must do a deep clone here instead.
    client = { ...client };

    // check for https://github.com/taskcluster/taskcluster/issues/3502
    if (!Array.isArray(client.scopes)) {
      assert(false, `Got non-array client.scopes=${util.inspect(client.scopes)} (see #3502)`);
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
export default ScopeResolver;
