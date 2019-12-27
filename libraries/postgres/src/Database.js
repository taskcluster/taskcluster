const {Pool} = require('pg');
const {dollarQuote} = require('./util');
const assert = require('assert').strict;
const debug = require('debug')('taskcluster-lib-postgres');
const {READ, WRITE} = require('./constants');

class Database {
  /**
   * Get a new Database instance
   */
  static async setup({schema, readDbUrl, writeDbUrl, serviceName}) {
    assert(readDbUrl, 'readDbUrl is required');
    assert(writeDbUrl, 'writeDbUrl is required');
    assert(schema, 'schema is required');
    assert(serviceName, 'serviceName is required');

    const db = new Database({urlsByMode: {[READ]: readDbUrl, [WRITE]: writeDbUrl}});
    db._createProcs({schema, serviceName});

    const dbVersion = await db.currentVersion();
    if (dbVersion < schema.latestVersion()) {
      throw new Error('Database version is older than this software version');
    }

    return db;
  }

  _createProcs({schema, serviceName}) {
    // generate a JS method for each DB method defined in the schema
    this.procs = {};
    schema.allMethods().forEach(({ name, mode, serviceName: procServiceName }) => {
      this.procs[name] = async (...args) => {
        if (serviceName !== procServiceName && mode === WRITE) {
          throw new Error(
            `${serviceName} is not allowed to call any methods that do not belong to this service and which have mode=WRITE`,
          );
        }

        const placeholders = [...new Array(args.length).keys()].map(i => `$${i + 1}`).join(',');
        const res = await this._withClient(mode, client => client.query(
          `select * from "${name}"(${placeholders})`, args));
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
    const db = new Database({urlsByMode: {admin: adminDbUrl, read: adminDbUrl}});

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
        for (let serviceName of Object.keys(schema.access)) {
          const username = `${usernamePrefix}_${serviceName.replace(/-/g, '_')}`;
          // always grant read access to tcversion
          await client.query(`grant select on tcversion to ${username}`);
          // allow access to the public schema
          await client.query(`grant usage on schema public to ${username}`);
        }
      });

      showProgress('...checking permissions');
      await Database._checkPermissions({db, schema, usernamePrefix});
    } finally {
      await db.close();
    }
  }

  static async _checkPermissions({db, schema, usernamePrefix}) {
    await db._withClient('admin', async (client) => {
      // determine current permissions in the form ["username: priv on table"].
      // This includes information from the column_privileges table as if it
      // was granting access to the entire table. We never use column
      // grants, so such an overstimation doesn't hurt. And revoking access
      // to a table implicitly revokes column grants for that table, too.
      const res = await client.query(`
        select grantee, table_name, privilege_type
          from information_schema.table_privileges
          where table_schema = 'public'
           and grantee like $1 || '\\_%'
           and table_catalog = current_catalog
           and table_name != 'tcversion'
        union
        select grantee, table_name, privilege_type
          from information_schema.column_privileges
          where table_schema = 'public'
           and grantee like $1 || '\\_%'
           and table_catalog = current_catalog
           and table_name != 'tcversion'`, [usernamePrefix.replace('_', '\\_')]);
      const currentPrivs = new Set(
        res.rows.map(row => `${row.grantee}: ${row.privilege_type} on ${row.table_name}`));

      const expectedPrivs = new Set();
      for (let serviceName of Object.keys(schema.access)) {
        const username = `${usernamePrefix}_${serviceName.replace(/-/g, '_')}`;

        // calculate the expected privs based on access.yml
        const tables = schema.access[serviceName].tables;
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

      if (issues.length > 0) {
        throw new Error(`Database privileges are not configured as expected:\n${issues.join('\n')}`);
      }
    });
  }

  async _doUpgrade({version, showProgress, usernamePrefix}) {
    await this._withClient('admin', async client => {
      await client.query('begin');
      if (version.version === 1) {
        await client.query('create table tcversion as select 0 as version');
      }

      // check the version and lock it to prevent other things from changing it
      const res = await client.query('select version from tcversion for update');
      if (res.rowCount !== 1 || res.rows[0].version !== version.version - 1) {
        throw Error('Multiple DB upgrades running simultaneously');
      }
      showProgress('..running migration script');
      const migrationScript = version.migrationScript
        .replace('$db_user_prefix$', usernamePrefix);
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
    });
  }

  /**
   * Private constructor (use Database.setup and Database.upgrade instead)
   */
  constructor({urlsByMode}) {
    const makePool = dbUrl => {
      const pool = new Pool({connectionString: dbUrl});
      // ignore errors from *idle* connections
      pool.on('error', client => {});
      return pool;
    };

    this.pools = {};
    for (let mode of Object.keys(urlsByMode)) {
      this.pools[mode] = makePool(urlsByMode[mode]);
    }

    this.procs = {};
  }

  /**
   * Run cb with a client.
   *
   * This is for INTERNAL USE ONLY.  All external access to the DB should be
   * performed via methods.
   */
  async _withClient(mode, cb) {
    const pool = this.pools[mode];
    if (!pool) {
      throw new Error(`No DB pool for mode ${mode}`);
    }
    const client = await pool.connect();
    try {
      try {
        return await cb(client);
      } catch (err) {
        // show hints or details from this error in the debug log, to help
        // debugging issues..
        if (err.hint) {
          debug(`HINT: ${err.hint}`);
        }
        if (err.detail) {
          debug(`DETAIL: ${err.detail}`);
        }
        throw err;
      }
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
          throw new Error('database corrupted; tcversion should hvae exactly one row');
        }
        return res.rows[0].version;
      } catch (err) {
        // catch "relation does not exist" and treat it as version 0
        if (err.code === '42P01') {
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
}

module.exports = Database;
