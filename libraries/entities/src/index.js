const assert = require('assert').strict;
const op = require('./entityops');
const types = require('./entitytypes');
const keys = require('./entitykeys');
const {
  DUPLICATE_TABLE,
  NUMERIC_VALUE_OUT_OF_RANGE,
  UNDEFINED_TABLE,
  UNIQUE_VIOLATION,
} = require('taskcluster-lib-postgres');

class Entity {
  static op = op;
  static keys = keys;
  static types = types;

  constructor(properties, options = {}) {
    const {
      etag,
      tableName,
      partitionKey,
      rowKey,
      db,
      context = {},
    } = options;

    assert(properties, 'properties is required');
    assert(tableName, 'tableName is required');
    assert(partitionKey, 'partitionKey is required');
    assert(rowKey, 'rowKey is required');
    assert(db, 'db is required');
    assert(typeof context === 'object' && context.constructor === Object, 'context should be an object');

    this.properties = this.deserialize(properties);
    this.etag = etag;
    this.tableName = tableName;
    this.partitionKey = partitionKey;
    this.rowKey = rowKey;
    this.db = db;

    Object.entries(context).forEach(([key, value]) => {
      this[key] = value;
    });

    Object.entries(properties).forEach(([key, value]) => {
      this[key] = value;
    });
  }

  async remove(ignoreChanges, ignoreIfNotExists) {
    const [result] = await this.db.fns[`${this.tableName}_remove`](this.partitionKey, this.rowKey);

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

  // load the properties from the table once more, and return true if anything has changed.
  // Else, return false.
  async reload() {
    const result = await this.db.fns[`${this.tableName}_load`](this.partitionKey, this.rowKey);
    const etag = result[0].etag;

    return etag !== this.etag;
  }

  async modify(modifier) {
    await modifier.call(this.properties, this.properties);

    return this.db.fns[`${this.tableName}_modify`](this.partitionKey, this.rowKey, this.properties, 1);
  }

  static _getContextEntries(contextNames, contextEntries) {
    const ctx = {};

    assert(typeof contextEntries === 'object' && contextEntries.constructor === Object, 'context should be an object');

    contextNames.forEach(key => {
      assert(key in contextEntries, `context key ${key} must be specified`);
    });

    Object.entries(contextEntries).forEach(([key, value]) => {
      assert(contextNames.includes(key), `context key ${key} was not declared in Entity.configure`);
      ctx[key] = value;
    });

    return ctx;
  }

  static _doCondition(conditions) {
    if (!conditions) {
      return null;
    }

    if (conditions) {
      assert(typeof conditions === 'object' && conditions.constructor === Object, 'conditions should be an object');
    }

    return Object.entries(conditions).map(([property, op]) => {
      const shouldAddQuotes = typeof this.mapping[property].name !== 'NumberType';

      // Ensure that we have an operator, we just assume anything specified
      // without an operator is equality
      if (!(op instanceof Entity.op)) {
        op = Entity.op.equal(op);
      }

      if (this.partitionKey.key === property) {
        return `partition_key ${op.operator} ${shouldAddQuotes ? `'${op.operand}'` : op.operand}`;
      }

      if (this.rowKey.key === property) {
        return `row_key ${op.operator} ${shouldAddQuotes ? `'${op.operand}'` : op.operand}`;
      }

      return `value ->> '${property}' ${op.operator} ${shouldAddQuotes ? `'${op.operand}'` : op.operand}`;
    }).join(' and ');
  }

  static calculateId(properties) {
    return {
      partitionKey: this.partitionKey.exact(properties),
      rowKey: this.rowKey.exact(properties),
    }
  }

  static async create(properties, overwrite) {
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

    return new this(properties, {
      etag,
      tableName: this.tableName,
      partitionKey,
      rowKey,
      db: this.db,
      context: this.contextEntries,
    });
  }

  /* NOOP */
  static async removeTable() {}

  /* NOOP */
  static async ensureTable() {}

  static async remove(properties, ignoreIfNotExists) {
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

  static async load(properties, ignoreIfNotExists) {
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

    return new this(result.value, {
      etag: result.etag,
      tableName: this.tableName,
      partitionKey,
      rowKey,
      db: this.db,
      context: this.contextEntries,
    });
  }

  static async scan(conditions, options = {}) {
    const {
      limit = 1000,
      page,
    } = options;
    const condition = this._doCondition(conditions);
    const result = await this.db.fns[`${this.tableName}_scan`](condition, limit, page);

    return result.map(entry => (
      new this(entry.value, {
        etag: entry.etag,
        tableName: this.tableName,
        partitionKey: entry.partition_key,
        rowKey: entry.row_key,
        db: this.db,
        context: this.contextEntries,
      })
    ));
  }

  static query(conditions, options = {}) {
    return this.scan(conditions, options);
  }

  static configure(configureOptions) {
    class ConfiguredEntity extends Entity {
      static setup(setupOptions) {
        const {
          tableName,
          db,
          serviceName,
        } = setupOptions;

        ConfiguredEntity.contextEntries = ConfiguredEntity._getContextEntries(
          configureOptions.context || [],
          setupOptions.context || {});
        ConfiguredEntity.tableName = tableName;
        ConfiguredEntity.serviceName = serviceName;
        ConfiguredEntity.db = db;

        return ConfiguredEntity;
      }

      deserialize(properties) {
        const deserializedProperties = {};

        Object.entries(configureOptions.properties).forEach(([key, Type]) => {
          deserializedProperties[key] = new Type(key).deserialize(properties);
        });

        return deserializedProperties;
      }
    }

    if (configureOptions.context) {
      assert(configureOptions.context instanceof Array, 'context must be an array');

      configureOptions.context.forEach(key => {
        assert(typeof key === 'string', 'elements of context must be strings');
        assert(configureOptions.properties[key] === undefined, `property name ${key} is defined in properties and cannot be specified in context`);
        assert(!Reflect.ownKeys(this.prototype).includes(key), `property name ${key} is reserved and cannot be specified in context`);
      });
    }

    ConfiguredEntity.mapping = {};
    Object.entries(configureOptions.properties).forEach(([key, Type]) => {
      ConfiguredEntity.mapping[key] = new Type(key);
    });

    ConfiguredEntity.partitionKey = configureOptions.partitionKey(ConfiguredEntity.mapping);
    ConfiguredEntity.rowKey = configureOptions.rowKey(ConfiguredEntity.mapping);
    // TODO: more configureOptions
    return ConfiguredEntity;
  }
}

module.exports = {
  Entity,
};
