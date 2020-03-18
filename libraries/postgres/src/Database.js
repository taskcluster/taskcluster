const {Pool} = require('pg');
const {dollarQuote, annotateError} = require('./util');
const assert = require('assert').strict;
const {READ, WRITE, DUPLICATE_OBJECT, UNDEFINED_TABLE} = require('./constants');

// Postgres extensions to "create".
const EXTENSIONS = [
  'pgcrypto',
];

class Database {
  /**
   * Get a new Database instance
   */
  static async setup({schema, readDbUrl, writeDbUrl, serviceName, statementTimeout}) {
    assert(readDbUrl, 'readDbUrl is required');
    assert(writeDbUrl, 'writeDbUrl is required');
    assert(schema, 'schema is required');
    assert(serviceName, 'serviceName is required');

    const db = new Database({urlsByMode: {[READ]: readDbUrl, [WRITE]: writeDbUrl}, statementTimeout});
    db._createProcs({schema, serviceName});

    const dbVersion = await db.currentVersion();
    if (dbVersion < schema.latestVersion()) {
      throw new Error('Database version is older than this software version');
    }

    return db;
  }

  _createProcs({schema, serviceName}) {
    // generate a JS method for each DB method defined in the schema
    this.fns = {};
    schema.allMethods().forEach(method => {
      // ignore deprecated methods
      if (method.deprecated) {
        return;
      }

      this.fns[method.name] = async (...args) => {
        if (serviceName !== method.serviceName && method.mode !== READ) {
          throw new Error(
            `${serviceName} is not allowed to call read-write methods for other services`);
        }

        const placeholders = [...new Array(args.length).keys()].map(i => `$${i + 1}`).join(',');
        const res = await this._withClient(method.mode, async client => {
          await client.query(method.mode === READ ? 'begin read only' : 'begin read write');
          try {
            let res = await client.query(`select * from "${method.name}"(${placeholders})`, args);
            await client.query('commit');
            return res;
          } catch (err) {
            try {
              await client.query('rollback');
            } catch (_) {
              // Ignore, as we are already throwing the original error.  This
              // is probably a case of a server shutting down or a failed
              // connection.
            }
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
  static async upgrade({schema, showProgress = () => {}, usernamePrefix, toVersion, adminDbUrl}) {
    assert(Database._validUsernamePrefix(usernamePrefix));
    const db = new Database({urlsByMode: {admin: adminDbUrl, read: adminDbUrl}});

    await db._createExtensions();

    try {
      // perform any necessary upgrades..
      const dbVersion = await db.currentVersion();
      const stopAt = toVersion === undefined ? schema.latestVersion().version : toVersion;
      if (dbVersion < stopAt) {
        // run each of the upgrade scripts
        for (let v = dbVersion + 1; v <= stopAt; v++) {
          showProgress(`upgrading database to version ${v}`);
          const version = schema.getVersion(v);
          await db._doUpgrade({version, showProgress, usernamePrefix});
          showProgress(`upgrade to version ${v} successful`);
        }
      } else {
        showProgress('No database upgrades required');
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
      if (toVersion === schema.latestVersion().version) {
        showProgress('...checking permissions');
        await Database._checkPermissions({db, schema, usernamePrefix});
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
  static async downgrade({schema, showProgress = () => {}, usernamePrefix, toVersion, adminDbUrl}) {
    assert(Database._validUsernamePrefix(usernamePrefix));
    const db = new Database({urlsByMode: {admin: adminDbUrl, read: adminDbUrl}});

    await db._createExtensions();

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

      if (dbVersion > toVersion) {
        // run each of the upgrade scripts
        for (let v = dbVersion; v > toVersion; v--) {
          showProgress(`downgrading database to version ${v}`);
          const fromVersion = schema.getVersion(v);
          const toVersion = v === 1 ? {version: 0, methods: []} : schema.getVersion(v - 1);
          await db._doDowngrade({fromVersion, toVersion, showProgress, usernamePrefix});
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

  static async _checkPermissions({db, schema, usernamePrefix}) {
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

  async _doUpgrade({version, showProgress, usernamePrefix}) {
    await this._withClient('admin', async client => {
      await client.query('begin');

      try {
        if (version.version === 1) {
          await client.query('create table if not exists tcversion as select 0 as version');
        }

        // check the version and lock it to prevent other things from changing it
        const res = await client.query('select version from tcversion for update');
        if (res.rowCount !== 1 || res.rows[0].version !== version.version - 1) {
          throw Error('Multiple DB upgrades running simultaneously');
        }
        showProgress('..running migration script');
        const migrationScript = version.migrationScript
          .replace(/\$db_user_prefix\$/g, usernamePrefix);
        await client.query(`DO ${dollarQuote(migrationScript)}`);
        showProgress('..defining methods');
        for (let [methodName, { args, body, returns}] of Object.entries(version.methods)) {
          await client.query(`create or replace function
          "${methodName}"(${args})
          returns ${returns}
          as ${dollarQuote(body)}
          language plpgsql`);
        }
        showProgress('..updating version');
        await client.query('update tcversion set version = $1', [version.version]);
        showProgress('..committing transaction');
        await client.query('commit');
      } catch (err) {
        await client.query('commit');
        throw err;
      }
    });
  }

  async _doDowngrade({fromVersion, toVersion, showProgress, usernamePrefix}) {
    assert.equal(fromVersion.version, toVersion.version + 1);
    await this._withClient('admin', async client => {
      await client.query('begin');

      try {
        // check the version and lock it to prevent other things from changing it
        const res = await client.query('select version from tcversion for update');
        if (res.rowCount !== 1 || res.rows[0].version !== fromVersion.version) {
          throw Error('Multiple DB modifications running simultaneously');
        }
        showProgress('..running downgrade script');
        const downgradeScript = fromVersion.downgradeScript
          .replace(/\$db_user_prefix\$/g, usernamePrefix);
        await client.query(`DO ${dollarQuote(downgradeScript)}`);
        showProgress('..defining methods');
        for (let [methodName, { args, body, returns}] of Object.entries(toVersion.methods)) {
          await client.query(`create or replace function
          "${methodName}"(${args})
          returns ${returns}
          as ${dollarQuote(body)}
          language plpgsql`);
        }
        showProgress('..updating version');
        await client.query('update tcversion set version = $1', [toVersion.version]);
        showProgress('..committing transaction');
        await client.query('commit');
      } catch (err) {
        await client.query('commit');
        throw err;
      }
    });
  }

  /**
   * Private constructor (use Database.setup and Database.upgrade instead)
   */
  constructor({urlsByMode, statementTimeout}) {
    assert(!statementTimeout || typeof statementTimeout === 'number');
    const makePool = dbUrl => {
      const pool = new Pool({connectionString: dbUrl});
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
          // note that postgres placeholders don't seem to work here.  So we check
          // that this is a number (above) and subtitute it directly
          await client.query(`set statement_timeout = ${statementTimeout}`);
        }

        // Unconditionally apply a timeout for idle transactions. we should
        // never be idle in a transaction (well, for more than few ms beteween
        // statements)  Holding a transaction open can make locks pile up and
        // also prevent vacuuming of tables, both leading to performance
        // issues.  This is here to catch programming errors, but in a case
        // where the server or the client are already overloaded this timer
        // could also start running.
        await client.query('set idle_in_transaction_session_timeout = 1000');
      });
      return pool;
    };

    this.pools = {};
    for (let mode of Object.keys(urlsByMode)) {
      this.pools[mode] = makePool(urlsByMode[mode]);
    }

    this.fns = {};
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
      client.release();
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
   * Wrap up operations on this DB
   */
  async close() {
    await Promise.all(Object.values(this.pools).map(pool => pool.end()));
  }

  static _validUsernamePrefix(usernamePrefix) {
    return usernamePrefix.match(/^[a-z_]+$/);
  }
}

module.exports = Database;
