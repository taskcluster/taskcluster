const _ = require('lodash');
const { Pool } = require('pg');
const pg = require('pg');
const crypto = require('crypto');
const { annotateError } = require('./util');
const Keyring = require('./Keyring');
const assert = require('assert').strict;
const { READ, WRITE, DUPLICATE_OBJECT, UNDEFINED_TABLE } = require('./constants');
const { MonitorManager } = require('taskcluster-lib-monitor');
const { parse: parseConnectionString } = require('pg-connection-string');
const { runMigration, runOnlineMigration, runDowngrade, runOnlineDowngrade, dropOnlineFns } = require('./migration');

// Postgres extensions to "create".
const EXTENSIONS = [
  'pgcrypto',
];

// Node-postgres assumes that all Date objects are in the local timezone.  In
// Taskcluster, we always use Date objects in UTC.  Happily, the library's
// questionable decision can be overridden globally:
pg.defaults.parseInputDatesAsUTC = true;

MonitorManager.register({
  name: 'dbFunctionCall',
  title: 'DB Method Call',
  type: 'db-function-call',
  level: 'info',
  version: 1,
  description: `This message is logged for each invocation of a Postgres stored function.`,
  fields: {
    name: 'The name of the DB function',
  },
});

MonitorManager.register({
  name: 'dbPoolCounts',
  title: 'DB Pool Counts',
  type: 'db-pool-counts',
  level: 'notice',
  version: 1,
  description: `
    This message is logged every minute from each process that is using the database,
    once for each pool.  Most services have both a "read" pool and a "write" pool.  The
    fields come from the node-postgres package.
  `,
  fields: {
    pool: 'The name of the pool within the process',
    totalCount: 'The total number of connections',
    idleCount: 'The number of connections (out of the total) which are not currently in use',
    waitingCount: 'The number of operations waiting for an idle connection',
  },
});

class Database {
  /**
   * Get a new Database instance
   */
  static async setup({ schema, readDbUrl, writeDbUrl, dbCryptoKeys,
    azureCryptoKey, serviceName, monitor, statementTimeout, poolSize }) {
    assert(readDbUrl, 'readDbUrl is required');
    assert(writeDbUrl, 'writeDbUrl is required');
    assert(schema, 'schema is required');
    assert(serviceName, 'serviceName is required');
    assert(monitor !== undefined, 'monitor is required (but use `false` to disable)');

    const keyring = new Keyring({ azureCryptoKey, dbCryptoKeys });

    const db = new Database({
      urlsByMode: { [READ]: readDbUrl, [WRITE]: writeDbUrl },
      monitor,
      statementTimeout,
      poolSize,
      keyring,
    });
    db._createProcs({ schema, serviceName });

    const dbVersion = await db.currentVersion();
    if (dbVersion < schema.latestVersion()) {
      throw new Error('Database version is older than this software version');
    }

    return db;
  }

  _createProcs({ schema, serviceName }) {
    // generate a JS method for each DB method defined in the schema
    this.fns = {};
    this.deprecatedFns = {};
    schema.allMethods().forEach(method => {
      let collection = this.fns;
      if (method.deprecated) {
        collection = this.deprecatedFns;
      }

      collection[method.name] = async (...args) => {
        if (serviceName !== method.serviceName && method.mode !== READ) {
          throw new Error(
            `${serviceName} is not allowed to call read-write methods for ${method.serviceName}`);
        }

        this._logDbFunctionCall({ name: method.name });

        // For now we only support named arguments that end with "_in" to make sure
        // functions that take a single object argument are not incorrectly labeled as named arguments.
        const validNamedArgument = key => /^[a-z0-9_]+_in$/.test(key);
        const hasNamedArguments = args.length === 1
          && _.isPlainObject(args[0])
          && Object.keys(args[0]).every(validNamedArgument);
        const res = await this._withClient(method.mode, async client => {
          await client.query(method.mode === READ ? 'begin read only' : 'begin read write');
          try {
            let res;
            if (hasNamedArguments) {
              const obj = args[0];
              const keys = Object.keys(obj);
              const values = keys.map(k => obj[k]); // order must match keys!
              const placeholders = keys.map((key, i) => `${key} => $${i + 1}`).join(',');
              res = await client.query(`select * from "${method.name}"(${placeholders})`, values);
            } else {
              const placeholders = [...new Array(args.length).keys()].map(i => `$${i + 1}`).join(',');
              res = await client.query(`select * from "${method.name}"(${placeholders})`, args);
            }
            await client.query('commit');
            return res;
          } catch (err) {
            // before continuing to handle the error, roll this transaction back
            try {
              await client.query('rollback');
            } catch (_) {
              // Ignore, as we are already throwing the original error.  This
              // is probably a case of a server shutting down or a failed
              // connection.
            }

            // generate a sentry fingerprint for this error, to avoid lumping all
            // errors into the same event.  This considers the method name and the
            // response code, but not the inputs.
            err.sentryFingerprint = `pg-${method.name}-${err.code}`;

            throw err;
          }
        });
        return res.rows;
      };
    });
  }

  /**
   * Upgrade this database to the latest version and define functions for all
   * of the methods.
   *
   * The `showProgress` parameter is a callable that displays a message showing
   * progress of the upgrade.
   *
   * If given, the upgrade process stops at toVersion; this is used for testing.
   */
  static async upgrade({ schema, showProgress = () => {}, usernamePrefix, toVersion, adminDbUrl, skipChecks }) {
    assert(Database._validUsernamePrefix(usernamePrefix));
    const db = new Database({ urlsByMode: { admin: adminDbUrl, read: adminDbUrl } });

    await db._createExtensions();
    await db._checkDbSettings();
    await db._checkVersion();

    try {
      // perform any necessary upgrades..
      const dbVersion = await db.currentVersion();
      const latestVersion = schema.latestVersion().version;
      const stopAt = toVersion === undefined ? latestVersion : toVersion;
      if (stopAt > latestVersion) {
        throw new Error(`no such version ${stopAt}; latest known version is ${latestVersion}`);
      }

      // start by running the previous version's online migration, to ensure it finished
      await db._withClient('admin', async client => {
        await runOnlineMigration({ client, showProgress, versionNum: dbVersion });
        await dropOnlineFns({ client, kind: 'migration', versionNum: dbVersion, showProgress });
      });

      // run each of the upgrade scripts
      for (let v = dbVersion + 1; v <= stopAt; v++) {
        showProgress(`upgrading database to version ${v}`);
        const version = schema.getVersion(v);
        await db._withClient('admin', async client => {
          await dropOnlineFns({ client, kind: 'migration', versionNum: version.version, showProgress });
          await runMigration({ client, version, showProgress, usernamePrefix });
          await runOnlineMigration({ client, showProgress, versionNum: v });
          await dropOnlineFns({ client, kind: 'migration', versionNum: version.version, showProgress });
        });
        showProgress(`upgrade to version ${v} successful`);
      }

      showProgress('...updating users');
      await db._withClient('admin', async client => {
        // make sure all services have basic levels of access..
        for (let serviceName of schema.access.serviceNames()) {
          const username = `${usernamePrefix}_${serviceName.replace(/-/g, '_')}`;
          // always grant read access to tcversion
          await client.query(`grant select on tcversion to ${username}`);
          // allow access to the public schema
          await client.query(`grant usage on schema public to ${username}`);
        }
      });

      // access.yml corresponds to the latest version, so only check
      // permissions if upgrading to that version
      if (stopAt === schema.latestVersion().version && !skipChecks) {
        showProgress('...checking permissions');
        await Database._checkPermissions({ db, schema, usernamePrefix });
        showProgress('...checking table columns');
        await Database._checkTableColumns({ db, schema, usernamePrefix });
      }
    } finally {
      await db.close();
    }
  }

  /**
   * Downgrade this database to the given version and define functions for all
   * of the methods in that version.  Note that this does not remove unknown
   * functions.
   *
   * The `showProgress` parameter is like that for upgrade().
   */
  static async downgrade({ schema, showProgress = () => {}, usernamePrefix, toVersion, adminDbUrl }) {
    assert(Database._validUsernamePrefix(usernamePrefix));
    const db = new Database({ urlsByMode: { admin: adminDbUrl, read: adminDbUrl } });

    await db._createExtensions();
    await db._checkDbSettings();
    await db._checkVersion();

    if (typeof toVersion !== 'number') {
      throw new Error('Target DB version must be an integer');
    }

    try {
      // perform any necessary upgrades..
      const latestVersion = schema.latestVersion().version;
      const dbVersion = await db.currentVersion();
      if (dbVersion > latestVersion) {
        throw new Error(`This Taskcluster release version is too old to downgrade from DB version ${dbVersion}`);
      }

      if (dbVersion >= toVersion) {
        // start by running the subsequent version's online downgrade, if
        // defined, to ensure it finished
        await db._withClient('admin', async client => {
          await runOnlineDowngrade({ client, showProgress, versionNum: dbVersion + 1 });
          await dropOnlineFns({ client, kind: 'downgrade', versionNum: dbVersion + 1, showProgress });
        });

        // run each of the upgrade scripts
        for (let v = dbVersion; v > toVersion; v--) {
          showProgress(`downgrading database from version ${v} to version ${v - 1}`);
          const fromVersion = schema.getVersion(v);
          const toVersion = v === 1 ? { version: 0, methods: [] } : schema.getVersion(v - 1);
          await db._withClient('admin', async client => {
            await dropOnlineFns({ client, kind: 'downgrade', versionNum: fromVersion.version, showProgress });
            await runDowngrade({
              client,
              schema,
              fromVersion,
              toVersion,
              showProgress,
              usernamePrefix,
            });
            await runOnlineDowngrade({ client, showProgress, versionNum: fromVersion.version });
            await dropOnlineFns({ client, kind: 'downgrade', versionNum: fromVersion.version, showProgress });
          });
          showProgress(`downgrade to version ${v - 1} successful`);
        }
      } else {
        showProgress(`No database downgrades required; now at DB version ${dbVersion}`);
      }

      // after a downgrade, `access.yml` for this version of the TC services no longer
      // matches the deployed access, so we do not check it.
    } finally {
      await db.close();
    }
  }

  static async _checkPermissions({ db, schema, usernamePrefix }) {
    await db._withClient('admin', async (client) => {
      const usernamePattern = usernamePrefix.replace('_', '\\_') + '\\_%';
      // determine current permissions in the form ["username: priv on table"].
      // This includes information from the column_privileges table as if it
      // was granting access to the entire table. We never use column
      // grants, so such an overestimation doesn't hurt. And revoking access
      // to a table implicitly revokes column grants for that table, too.
      const res = await client.query(`
        select grantee, table_name, privilege_type
          from information_schema.table_privileges
          where table_schema = 'public'
           and grantee like $1
           and table_catalog = current_catalog
           and table_name != 'tcversion'
        union
        select grantee, table_name, privilege_type
          from information_schema.column_privileges
          where table_schema = 'public'
           and grantee like $1
           and table_catalog = current_catalog
           and table_name != 'tcversion'`, [usernamePattern]);
      const currentPrivs = new Set(
        res.rows.map(row => `${row.grantee}: ${row.privilege_type} on ${row.table_name}`));

      const expectedPrivs = new Set();
      for (let serviceName of schema.access.serviceNames()) {
        const username = `${usernamePrefix}_${serviceName.replace(/-/g, '_')}`;

        // calculate the expected privs based on access.yml
        const tables = schema.access.tables(serviceName);
        Object.entries(tables).forEach(([table, mode]) => {
          if (mode === 'read') {
            expectedPrivs.add(`${username}: SELECT on ${table}`);
          } else if (mode === 'write') {
            expectedPrivs.add(`${username}: SELECT on ${table}`);
            expectedPrivs.add(`${username}: INSERT on ${table}`);
            expectedPrivs.add(`${username}: UPDATE on ${table}`);
            expectedPrivs.add(`${username}: DELETE on ${table}`);
          }
        });
      }

      const issues = [];
      for (let cur of currentPrivs) {
        if (!expectedPrivs.has(cur)) {
          issues.push(`unexpected database user grant: ${cur}`);
        }
      }

      for (let exp of expectedPrivs) {
        if (!currentPrivs.has(exp)) {
          issues.push(`missing database user grant: ${exp}`);
        }
      }

      // look for unexpected user attributes
      const badAttrs = {
        'superuser': 'rolsuper',
        'createrole': 'rolcreaterole',
        'createdb': 'rolcreatedb',
        'replication': 'rolreplication',
      };

      const attrRes = await client.query(`
        select
          rolname as user,
          rolsuper,
          rolcreaterole,
          rolcreatedb,
          rolreplication
        from
          pg_catalog.pg_roles
        where
          (${Object.values(badAttrs).join(' or ')}) and
          rolname like $1`, [usernamePattern]);
      for (const row of attrRes.rows) {
        for (const [attr, col] of Object.entries(badAttrs)) {
          if (row[col]) {
            issues.push(`${row.user} has attribute ${attr.toUpperCase()}`);
          }
        }
      }

      // look for unexpected granted roles
      const roleRes = await client.query(`
        select
          r.rolname as role,
          u.rolname as user
        from
          pg_catalog.pg_roles as r,
          pg_catalog.pg_roles as u,
          pg_catalog.pg_auth_members
        where
         r.oid = roleid and
         u.oid = member and
         u.rolname like $1`, [usernamePattern]);
      for (const row of roleRes.rows) {
        issues.push(`${row.user} has unexpected role ${row.role}`);
      }

      if (issues.length > 0) {
        throw new Error(`Database privileges are not configured as expected:\n${issues.join('\n')}`);
      }
    });
  }

  static async _checkTableColumns({ db, schema }) {
    const current = await db._withClient('admin', async client => {
      const tables = {};

      const tablesres = await client.query(`
        select
          c.relname as tablename,
          c.oid as oid
        from
          pg_catalog.pg_class c
          left join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where
          c.relkind='r' and
          n.nspname = 'public' and
          c.relname != 'tcversion'
      `);

      for (const { tablename, oid } of tablesres.rows) {
        const rowsres = await client.query(`
          select
            attname,
            pg_catalog.format_type(a.atttypid, a.atttypmod) as type,
            a.attnotnull as notnull
          from
            pg_catalog.pg_attribute a
          where
            -- attnum's < 0 are internal
            -- dropped attributes are invisible
            a.attrelid=$1 and a.attnum > 0 and not attisdropped
        `, [oid]);
        tables[tablename] = Object.fromEntries(
          rowsres.rows.map(({ attname, type, notnull }) => ([attname, `${type}${notnull ? ' not null' : ''}`])));
      }

      return tables;
    });

    assert.deepEqual(current, schema.tables.get());
  }

  async _checkVersion() {
    await this._withClient('admin', async client => {
      const version = await client.query(`
        SELECT current_setting('server_version_num');
      `);
      const ver = version.rows[0].current_setting;
      if (ver < 110000) {
        throw new Error("Postgres version is less than 11. Please upgrade to 11.x");
      }
      if (ver >= 120000) {
        throw new Error("Postgres version is greater than 11. Please downgrade to 11.x");
      }
    });
  }

  async _createExtensions() {
    await this._withClient('admin', async client => {
      for (let ext of EXTENSIONS) {
        try {
          await client.query('create extension ' + ext);
        } catch (err) {
          // ignore errors from the extension already being installed
          if (err.code !== DUPLICATE_OBJECT) {
            throw err;
          }
        }
      }
    });
  }

  async _checkDbSettings() {
    await this._withClient('admin', async client => {
      // check the DB collation by its behavior, rather than by name, as names seem to vary.
      for (const pair of ['aA', 'ab', 'Ab', 'aB', 'AB', '0a', '0A']) {
        const res = await client.query(`select 1 where $1 >= $2`, [pair[0], pair[1]]);
        if (res.rows.length > 0) {
          const res = await client.query(`
            SELECT datcollate AS collation
            FROM pg_database
            WHERE datname = current_database()`);
          const collation = res.rows[0].collation;
          throw new Error([
            'Postgres database must have default collation en_US.utf8 (and in particular sort',
            '`0` < `a` < `A` < `b` < `B`, for proper slugid ordering);',
            `this database is using ${collation}, and sorts '${pair[0]}' >= '${pair[1]}'.`,
          ].join(' '));
        }
      }
    });
  }

  /**
   * Private constructor (use Database.setup and Database.upgrade instead)
   */
  constructor({ urlsByMode, monitor, statementTimeout, poolSize, keyring }) {
    assert(!statementTimeout || typeof statementTimeout === 'number' || typeof statementTimeout === 'boolean');
    const makePool = dbUrl => {
      const connectOptions = {
        // default to a max of 5 connections. For services running both a read
        // and write pool, this is a maximum of 10 concurrent connections.  Other
        // requests will be queued.
        max: poolSize || 5,
      };

      /// post-process the DB URL a little bit
      let config = parseConnectionString(dbUrl);
      if (config.ssl === true) {
        // As of node-pg 8.x, SSL connections with `ssl=1` try to verify the SSL
        // connection's certificate chain.  In most cases, this doesn't work, so
        // we treat that configuration as node-pg 7.x did: use the SSL encryption,
        // but don't verify the remote host.  The documentation describes ways to do
        // better.
        config.ssl = { rejectUnauthorized: false };
      } else if (config.ssl === 'authorized') {
        // For the custom `ssl=authorized` flag, reject unauthorized connections
        // (this is equivalent to `config.ssl = true`)
        config.ssl = { rejectUnauthorized: true };
      }

      const pool = new Pool({ ...config, ...connectOptions });
      // ignore errors from *idle* connections.  From the docs:
      //
      // > When a client is sitting idly in the pool it can still emit errors
      // > because it is connected to a live backend. If the backend goes down or
      // > a network partition is encountered all the idle, connected clients in
      // > your application will emit an error through the pool's error event
      // > emitter. The error listener is passed the error as the first argument
      // > and the client upon which the error occurred as the 2nd argument. The
      // > client will be automatically terminated and removed from the pool, it
      // > is only passed to the error handler in case you want to inspect it.
      //
      // So Pool will handle those errors properly, and we must only register an
      // handler so that Node does not complain of an unhandled error event.
      pool.on('error', client => {});
      pool.on('connect', async client => {
        if (statementTimeout) {
          // For web API servers, we want to abort queries that take too long, sa
          // the HTTP client has probably given up.
          //
          // Note that postgres placeholders don't seem to work here.  So we check
          // that this is a number (above) and subtitute it directly
          await client.query(`set statement_timeout = ${statementTimeout}`);
        }

        // Unconditionally apply a timeout for idle transactions. we should
        // never be idle in a transaction (well, for more than few ms beteween
        // statements)  Holding a transaction open can make locks pile up and
        // also prevent vacuuming of tables, both leading to performance
        // issues.  This is here to catch programming errors, but in a case
        // where the server or the client are already overloaded this timer
        // could also start running.  The value is set to something fairly
        // high since in times of high load Node falls behind and leaves
        // sessions idle (#2577).
        await client.query('set idle_in_transaction_session_timeout = 20000');
      });
      return pool;
    };

    this.monitor = monitor;

    this.pools = {};
    for (let mode of Object.keys(urlsByMode)) {
      this.pools[mode] = makePool(urlsByMode[mode]);
    }

    this._startMonitoringPools();

    this.fns = {};
    this.keyring = keyring;
  }

  /**
   * Run cb with a client.
   *
   * This is for use in tests and within this library only.  All "real" access
   * to the DB should be performed via stored functions.
   *
   * This annotates syntax errors from `query` with the position at which the
   * error occurred.
   */
  async _withClient(mode, cb) {
    const pool = this.pools[mode];
    if (!pool) {
      throw new Error(`No DB pool for mode ${mode}`);
    }
    const client = await pool.connect();
    // while we have the client "checked out" from the pool, the pool has
    // stopped listening for error events on it.  We don't actually care
    // about such error events, as they will simply cause an error on the
    // next attempt to use the client, but we have to handle them anyway
    // or Node will kill the process.  However, when this happens we must
    // pass the error back to the pool or it won't know the client is bad.
    let clientError = undefined;
    const handleError = err => clientError = err;
    client.on('error', handleError);
    const wrapped = {
      query: async function(query) {
        try {
          return await client.query.apply(client, arguments);
        } catch (err) {
          annotateError(query, err);
          throw err;
        }
      },
    };
    try {
      return await cb(wrapped);
    } finally {
      client.removeListener('error', handleError);
      client.release(clientError);
    }
  }

  /**
   * Get the version of this database
   */
  async currentVersion() {
    // get from the version table or return 0
    return await this._withClient(READ, async client => {
      try {
        const res = await client.query('select version from tcversion');
        if (res.rowCount !== 1) {
          throw new Error('database corrupted; tcversion should have exactly one row');
        }
        return res.rows[0].version;
      } catch (err) {
        if (err.code === UNDEFINED_TABLE) {
          return 0;
        }
        throw err;
      }
    });
  }

  /**
   * Periodically monitor pool size, producing a measure every 1m.  These values
   * should represent a long-term trend so more frequent reports are not useful.
   */
  _startMonitoringPools() {
    this._poolMonitorInterval = setInterval(() => {
      for (const [name, pool] of Object.entries(this.pools)) {
        this._logDbPoolCounts({
          pool: name,
          totalCount: pool.totalCount,
          idleCount: pool.idleCount,
          waitingCount: pool.waitingCount,
        });
      }
    }, 60 * 1000);
  }

  _stopMonitoringPools() {
    if (this._poolMonitorInterval) {
      clearInterval(this._poolMonitorInterval);
    }
    this._poolMonitorInterval = null;
  }

  /**
   * Wrap up operations on this DB
   */
  async close() {
    this._stopMonitoringPools();
    await Promise.all(Object.values(this.pools).map(pool => pool.end()));
  }

  static _validUsernamePrefix(usernamePrefix) {
    return usernamePrefix.match(/^[a-z_]+$/);
  }

  /**
   * Depending on context, we may not have a monitor (e.g., during upgrade), so
   * these methods wrap calls to `monitor.<foo>` with a check for monitor being
   * undefined, ignoring the call in that case.
   */
  _logDbFunctionCall(fields) {
    if (this.monitor) {
      this.monitor.log.dbFunctionCall(fields);
    }
  }
  _logDbPoolCounts(fields) {
    if (this.monitor) {
      this.monitor.log.dbPoolCounts(fields);
    }
  }

  /**
   * Takes any bytes value (you must ensure this as the caller, e.g. `Buffer.from()`)
   * and returns an encrypted value for storing in the db with the current crypto key
   *
   * This currently only supports lib-entities shaped data but can be extended to support
   * other formats if needed. The "property name" is hardcoded to `val` since we only
   * have one property.
   */
  encrypt({ value }) {
    assert(value instanceof Buffer, 'Encrypted values must be Buffers');
    const { id, key } = this.keyring.currentCryptoKey('aes-256');

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const c1 = cipher.update(value);
    const c2 = cipher.final();

    return {
      kid: id,
      v: 0,
      __bufchunks_val: 1,
      __buf0_val: Buffer.concat([iv, c1, c2]).toString('base64'),
    };
  }

  /**
   * Given a value from the db that has been encrypted, figures out which crypto key
   * to use to decrypt it, and does so. Returns bytes that the caller must reconstruct
   * into whatever form they want to use.
   *
   * This currently only supports lib-entities shaped data but can be extended to support
   * other formats if needed. The "property name" is hardcoded to `val` since we only
   * have one property.
   */
  decrypt({ value }) {
    const key = this.keyring.getCryptoKey(value.kid, 'aes-256');

    const n = value['__bufchunks_val'];
    const chunks = [];
    for (let i = 0; i < n; i++) {
      chunks[i] = Buffer.from(value['__buf' + i + '_val'], 'base64');
    }
    const buffer = Buffer.concat(chunks);

    const iv = buffer.slice(0, 16);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const b1 = decipher.update(buffer.slice(16));
    const b2 = decipher.final();

    return Buffer.concat([b1, b2]);
  }
}

module.exports = Database;
