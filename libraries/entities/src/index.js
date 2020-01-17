const assert = require('assert').strict;
const RowClass = require('./RowClass');
const op = require('./entityops');
const types = require('./entitytypes');
const {
  DUPLICATE_TABLE,
  NUMERIC_VALUE_OUT_OF_RANGE,
  UNDEFINED_TABLE,
  UNIQUE_VIOLATION,
} = require('taskcluster-lib-postgres');

class Entity {
  constructor(options) {
    if (options.context) {
      assert(options.context instanceof Array, 'context must be an array');

      options.context.forEach(key => {
        assert(typeof key === 'string', 'elements of options.context must be strings');
        assert(options.properties[key] === undefined, `property name ${key} is defined in properties and cannot be specified in options.context`);
        assert(!Reflect.ownKeys(RowClass.prototype).includes(key), `property name ${key} is reserved and cannot be specified in options.context`);
      });
    }

    this.partitionKey = options.partitionKey;
    this.rowKey = options.rowKey;
    this.properties = options.properties;
    this.context = options.context || [];

    this.tableName = null;
    this.db = null;
    this.serviceName = null;
    this.contextEntries = null;
  }

  static op = op;

  static types = types;

  _getContextEntries(context) {
    const ctx = {};

    assert(typeof context === 'object' && context.constructor === Object, 'context should be an object');

    this.context.forEach(key => {
      assert(key in context, `context key ${key} must be specified`);
    });

    Object.entries(context).forEach(([key, value]) => {
      assert(this.context.includes(key), `context key ${key} was not declared in Entity.configure`);
      ctx[key] = value;
    });

    return ctx;
  }

  _doCondition(conditions) {
    if (!conditions) {
      return null;
    }

    if (conditions) {
      assert(typeof conditions === 'object' && conditions.constructor === Object, 'conditions should be an object');
    }

    return Object.entries(conditions).map(([property, { operator, operand }]) => {
      const shouldAddQuotes = typeof this.properties[property] === 'string';

      return `value ->> '${property}' ${operator} ${shouldAddQuotes ? `'${operand}'` : operand}`;
    }).join(' and ');
  }

  setup(options) {
    const {
      tableName,
      db,
      serviceName,
      context = {},
    } = options;

    this.contextEntries = this._getContextEntries(context);
    this.tableName = tableName;
    this.serviceName = serviceName;
    this.db = db;
  }

  // TODO: Fix this. This is totally wrong :-)
  calculateId(properties) {
    return {
      partitionKey: properties[this.partitionKey],
      rowKey: properties[this.rowKey],
    }
  }

  async create(properties, overwrite) {
    const { partitionKey, rowKey } = this.calculateId(properties);

    let res;
    try {
      res = await this.db.fns[`${this.tableName}_create`](partitionKey, rowKey, properties, overwrite, 1);
    } catch (err) {
      if (err.code === UNIQUE_VIOLATION) {
        const e = new Error('Entity already exists');
        e.code = 'EntityAlreadyExists';
        throw e;
      }

      // TODO: add a test for this
      if (err.code === NUMERIC_VALUE_OUT_OF_RANGE) {
        const e = new Error('Property too large');
        e.code = 'PropertyTooLarge';
        throw e;
      }

      throw err;
    }

    const etag = res[0][`${this.tableName}_create`];

    return new RowClass(properties, {
      etag,
      tableName: this.tableName,
      partitionKey,
      rowKey,
      db: this.db,
      context: this.contextEntries,
    });
  }

  async removeTable() {
    try {
      await this.db.fns[`${this.tableName}_remove_table`]();
    } catch (err) {
      if (err.code !== UNDEFINED_TABLE) {
        throw err;
      }

      const e = new Error('Resource not found');

      e.code = 'ResourceNotFound';
      e.statusCode = 404;
      throw e;
    }
  }

  /* NOOP */
  async ensureTable() {}

  async remove(properties, ignoreIfNotExists) {
    const { partitionKey, rowKey } = this.calculateId(properties);
    const [result] = await this.db.fns[`${this.tableName}_remove`](partitionKey, rowKey);

    if (result) {
      return true;
    }

    if (ignoreIfNotExists && !result) {
      return false;
    }

    if (!result) {
      const err = new Error('Resource not found');

      err.code = 'ResourceNotFound';
      err.statusCode = 404;

      throw err;
    }
  }

  modify(properties) {
    const { partitionKey, rowKey } = this.calculateId(properties);

    return this.db.fns[`${this.tableName}_modify`](partitionKey, rowKey, properties, 1);
  }

  async load(properties, ignoreIfNotExists) {
    const { partitionKey, rowKey } = this.calculateId(properties);
    const [result] = await this.db.fns[`${this.tableName}_load`](partitionKey, rowKey);

    if (!result && ignoreIfNotExists) {
      return null;
    }

    if (!result) {
      const err = new Error('Resource not found');

      err.code = 'ResourceNotFound';
      err.statusCode = 404;
      throw err;
    }

    return new RowClass(result.value, {
      etag: result.etag,
      tableName: this.tableName,
      partitionKey,
      rowKey,
      db: this.db,
      context: this.contextEntries,
    });
  }

  scan(conditions, options = {}) {
    const {
      limit = 1000,
      page,
    } = options;
    const condition = this._doCondition(conditions);

    return this.db.fns[`${this.tableName}_scan`](condition, limit, page);
  }

  query(conditions, options = {}) {
    return this.scan(conditions, options);
  }

  static configure(options) {
    return new Entity(options);
  }
}

module.exports = {
  Entity,
};
