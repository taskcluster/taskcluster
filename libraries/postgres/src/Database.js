const {Pool} = require('pg');
const {dollarQuote} = require('./util');
const assert = require('assert');
const debug = require('debug')('taskcluster-lib-postgres');
const {READ, WRITE} = require('./constants');

class Database {
  constructor({readDbUrl, writeDbUrl, schema, serviceName}) {
    assert(readDbUrl, 'readDbUrl is required');
    assert(writeDbUrl, 'writeDbUrl is required');
    assert(schema, 'schema is required');
    assert(serviceName, 'serviceName is required');

    const makePool = dbUrl => {
      const pool = new Pool({connectionString: dbUrl});
      // ignore errors from *idle* connections
      pool.on('error', client => {});
      return pool;
    };

    this.pools = {
      [READ]: makePool(readDbUrl),
      [WRITE]: makePool(writeDbUrl),
    };
    this.procs = {};

    // generate a JS method for each DB method defined in the schema
    schema.allMethods().forEach(({ name, mode, serviceName: procServiceName }) => {
      // ensure that quoting of identifiers is correct
      assert(!/.*[A-Z].*/.test(name), 'db procedure methods should not have capital letters');

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
   * Run cb with a client.
   *
   * This is for INTERNAL USE ONLY.  All external access to the DB should be
   * performed via methods.
   */
  async _withClient(wr, cb) {
    const pool = this.pools[wr];
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

  async _doUpgrade(version, showProgress) {
    await this._withClient(WRITE, async client => {
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
      await client.query(`DO ${dollarQuote(version.migrationScript)}`);
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
   * Wrap up operations on this DB
   */
  async close() {
    await Promise.all([
      this.pools[READ].end(),
      this.pools[WRITE].end(),
    ]);
  }
}

/**
 * Get a new Database instance
 */
Database.setup = async ({schema, ...dbOptions}) => {
  const db = new Database({...dbOptions, schema});
  const dbVersion = await db.currentVersion();
  if (dbVersion < schema.latestVersion()) {
    throw new Error('Database version is older than this software version');
  }
  return db;
};

/**
 * Upgrade this database to the latest version and define functions for all
 * of the methods.
 *
 * The `showProgress` parameter is a callable that displays a message showing
 * progress of the upgrade.
 *
 * If given, the upgrade process stops at toVersion; this is used for testing.
 */
Database.upgrade = async ({schema, showProgress = () => {}, toVersion, ...dbOptions}) => {
  const db = new Database({...dbOptions, schema});
  try {
    const dbVersion = await db.currentVersion();
    const stopAt = toVersion === undefined ? schema.latestVersion().version : toVersion;

    // perform any necessary upgrades..
    if (dbVersion < stopAt) {
      // run each of the upgrade scripts
      for (let v = dbVersion + 1; v <= stopAt; v++) {
        showProgress(`upgrading database to version ${v}`);
        const version = schema.getVersion(v);
        await db._doUpgrade(version, showProgress);
        showProgress(`upgrade to version ${v} successful`);
      }
    } else {
      showProgress('No database upgrades required');
    }
  } finally {
    await db.close();
  }
};

module.exports = Database;
