const {Pool, Client} = require('pg');
const {dollarQuote} = require('./util');
const assert = require('assert');
const debug = require('debug')('taskcluster-lib-postgres');

// Overall plan is: access is only through plpgsql functions, and those must
// have a consistent API (args + result).  Upgrades can redefine these
// functions and add new functions, but not change API as existing software may
// be using those functions concurrently.

const [READ, WRITE] = [Symbol('read'), Symbol('write')];

class Schema{
  /**
   * Create a new Schema
   *
   * script is a script to create the schema, suitable as an argument to
   * the Postgres DO statment; that is usually 'BEGIN stmt; stmt; .. END'.
   */
  constructor({script}, {version, versions, methods}={}) {
    assert(script, 'script is required');
    this.script = script;

    this.version = version || 1;
    this.versions = versions || [null];

    assert.equal(this.versions.length, this.version);
    this.versions.push(this);

    this.methods = new Map(methods);
  }

  /**
   * Add a new version to this schema; version must be one more than the
   * previous version.  A script must be provided to upgrade from the previous
   * version. All defined methods are reset.
   */
  addVersion(version, script) {
    assert(version === this.version + 1, 'versions must increment by one');
    return new Schema(
      {script},
      {version, versions: this.versions});
  }

  /**
   * Add a new method to this schema version.  Calling the method on the
   * resulting Database instance will invoke the given plpgsql script.  If the
   * method was already defined in a previous version, then its args and
   * returns must match the previous version exactly.
   */
  addMethod(method, rw, args, returns, script) {
    assert(script, 'script is required');
    if (this.methods.has(method)) {
      const prev = this.methods.get(method);
      assert.equal(args, prev.args,
        'method args must match previous version');
      assert.equal(returns, prev.returns,
        'method returns must match previous version');
    }
    this.methods.set(method, {rw, args, returns, script});
    return this;
  }

  /** testing **/

  /**
   * Get the schema as it was at the given version; this is used for testing
   * upgrades from old versions.
   */
  atVersion(version) {
    return this.versions[version];
  }
}

class Database {
  constructor({readDbUrl, writeDbUrl, schema}) {
    assert(readDbUrl, 'readDbUrl is required');
    assert(writeDbUrl, 'writeDbUrl is required');
    assert(schema, 'schema is required');

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

    // generate a JS method for each DB method defined in the schema
    schema.methods.forEach(({rw}, method) => {
      this[method] = async (...args) => {
        const placeholders = [...new Array(args.length).keys()].map(i => `$${i+1}`).join(',');
        const res = await this._withClient(rw, client => client.query(
          `select * from ${method}(${placeholders})`, args));
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
  async getVersion() {
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

  async _doUpgrade(script, version) {
    await this._withClient(WRITE, async client => {
      await client.query('begin');
      if (version === 1) {
        await client.query('create table tcversion as select 0 as version');
      }
      // check the version and lock it to prevent other things from changing it
      const res = await client.query('select version from tcversion for update');
      if (res.rowCount !== 1 || res.rows[0].version !== version - 1) {
        throw Error('Multiple DB upgrades running simultaneously');
      }
      await client.query(`DO ${dollarQuote(script)}`);
      await client.query('update tcversion set version = $1', [version]);
      await client.query('commit');
    });
  }

  async _defineMethod(method, args, returns, script) {
    await this._withClient(WRITE, async client => {
      await client.query(`create or replace function
        ${method}(${args})
        returns ${returns}
        as ${dollarQuote(script)}
        language plpgsql`);
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
Database.setup = async (schema, dbOptions) => {
  const db = new Database({...dbOptions, schema});
  const dbVersion = await db.getVersion();
  if (dbVersion < schema.version) {
    throw new Error('Database version is older than this software version');
  }
  return db;
};

/**
 * Upgrade this database to the latest version and define functions for all
 * of the methods.
 */
Database.upgrade = async (schema, dbOptions) => {
  const db = new Database({...dbOptions, schema});
  try {
    const dbVersion = await db.getVersion();

    // perform any necessary upgrades..
    if (dbVersion < schema.version) {
      // run each of the upgrade scripts
      for (let prevSchema of schema.versions.slice(dbVersion + 1)) {
        debug(`upgrading to version ${schema.version}`);
        await db._doUpgrade(prevSchema.script, prevSchema.version);
      }
    }

    // if we are running upgrades, unconditionally define the function objects
    // for the defined methods; this allows updates to those functions to fix
    // bugs without a new schema version.
    for (let [method, {args, returns, script}] of schema.methods) {
      debug(`defining method ${method}`);
      await db._defineMethod(method, args, returns, script);
    }
  } finally {
    await db.close();
  }
};

exports.Schema = Schema;
exports.Database = Database;
exports.READ = READ;
exports.WRITE = WRITE;
