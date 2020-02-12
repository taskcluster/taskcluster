const assert = require('assert').strict;
const _ = require('lodash');
const op = require('./entityops');
const types = require('./entitytypes');
const keys = require('./entitykeys');
const {
  DUPLICATE_TABLE,
  NUMERIC_VALUE_OUT_OF_RANGE,
  UNDEFINED_TABLE,
  UNIQUE_VIOLATION,
} = require('taskcluster-lib-postgres');
const crypto = require('crypto');
const { MAX_MODIFY_ATTEMPTS } = require('./constants');

/** Fixed time comparison of two buffers */
const fixedTimeComparison = function(b1, b2) {
  let mismatch = 0;
  mismatch |= !(b1 instanceof Buffer);
  mismatch |= !(b2 instanceof Buffer);
  mismatch |= b1.length !== b2.length;

  if (mismatch === 1) {
    return false;
  }

  const n = b1.length;

  for (var i = 0; i < n; i++) {
    mismatch |= b1[i] ^ b2[i];
  }

  return mismatch === 0;
};

// ** Coding Style **
// To ease reading of this component we recommend the following code guidelines:
//
// Summary:
//    - Use __ prefix for private members on `Entity.prototype` and
//      Use _  prefix for private members on `Entity` instances.
//    - Variables named `entity` are semi-raw `azure-table-node` types
//    - Variables named `item` are instances of `Entity`
//    - Variables named `properties` are deserialized `entity` objects
//
// Long Version:
//
//
//    * Variables named `entity` are "raw" entities, well raw in the sense that
//      they interface the transport layer provided by Azure Table Storage.
//
//    * Variables named `item` refers instances of `Entity` or instances of
//      subclasses of `Entity`. This is slightly confusing as people using the
//      `Entity` class (of subclasses thereof) are more likely refer to generic
//      instances of their subclasses as `entity` and not `item`.
//      We draw the distinction here because Azure Table Storage uses the
//      terminology entities. Also subclasses of `Entity` usually has another
//      name, like `Artifact`, so non-generic instances are easily referred to
//      using a variant of that name, like `artifact` as an instance of
//      `Artifact`.
//
//    * Variables named `properties` is usually a mapping from property names
//      to deserialized values.
//
//    * Properties that are private the `Entity` class, should be prefixed `__`,
//      this way subclasses of `Entity` (created with `Entity.configure`) can
//      rely on properties prefixed `_` as being private to them.
//
//    * Try to prevent users from making mistakes. Or doing illegal things, like
//      modifying objects unintentionally without changes being saved.
//
// Okay, that's it for now, happy hacking...
class Entity {
  static op = op;
  static keys = keys;
  static types = types;

  constructor(entity, options = {}) {
    const {
      etag,
      tableName,
      db,
      context = {},
    } = options;

    assert(entity, 'properties is required');
    assert(tableName, 'tableName is required');
    assert(db, 'db is required');
    assert(typeof context === 'object' && context.constructor === Object, 'context should be an object');

    this.etag = etag;
    this.tableName = tableName;
    this._partitionKey = entity.PartitionKey;
    this._rowKey = entity.RowKey;
    this.db = db;

    this._getPropertiesFromEntity(entity);

    Object.entries(context).forEach(([key, value]) => {
      this[key] = value;
    });
  }

  _getPropertiesFromEntity(entity) {
    this.properties = this.deserialize(entity); // TODO: _properties
    Object.entries(this.properties).forEach(([key, value]) => {
      this[key] = value;
    });
  }

  async remove(ignoreChanges, ignoreIfNotExists) {
    const [result] = await this.db.fns[`${this.tableName}_remove`](this._partitionKey, this._rowKey);

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
    const result = await this.db.fns[`${this.tableName}_load`](this._partitionKey, this._rowKey);
    const etag = result[0].etag;
    const hasChanged = etag !== this.etag;

    this._getPropertiesFromEntity(result[0].value);
    this.etag = etag;

    Object.entries(this.properties).forEach(([key, value]) => {
      this[key] = value;
    });

    return hasChanged;
  }

  async modify(modifier) {
    let attemptsLeft = MAX_MODIFY_ATTEMPTS;

    const attemptModify = async () => {
      const newProperties = _.cloneDeep(this.properties);
      await modifier.call(newProperties, newProperties);
      let result;
      try {
        newProperties.PartitionKey = this._partitionKey;
        newProperties.RowKey = this._rowKey;

        if (this.constructor.__hasSigning) {
          newProperties.Signature = this.constructor.__sign(newProperties);
        }

        [result] = await this.db.fns[`${this.tableName}_modify`](this._partitionKey, this._rowKey, newProperties, 1, this.etag);
      } catch (e) {
        if (e.code === 'P0004') {
          return null;
        }

        if (e.code === 'P0002') {
          const err = new Error('Resource not found');

          err.code = 'ResourceNotFound';
          err.statusCode = 404;

          throw err;
        }

        throw e;
      }

      const entity = this.constructor.serialize(newProperties);

      this._getPropertiesFromEntity(entity);
      this.etag = result.etag;

      return this;
    };

    let result;
    while (attemptsLeft--) {
      result = await attemptModify();

      if (result) {
        break;
      }

      await this.reload();
    }

    if (attemptsLeft <= 0) {
      const err = new Error('MAX_MODIFY_ATTEMPTS exhausted, check for congestion');
      err.code = 'EntityWriteCongestionError';
      err.originalEntity = this.properties;
      throw err;
    }

    return result;
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

  static _doCondition(conditions, options) {
    const valueFromOperand = (operand) => {
      if (operand instanceof Date) {
        return operand.toJSON();
      }

      return operand;
    };

    if (!conditions) {
      return null;
    }

    if (conditions) {
      assert(typeof conditions === 'object' && conditions.constructor === Object, 'conditions should be an object');
    }

    const condition = Object.entries(conditions).map(([property, op]) => {
      const shouldAddQuotes = typeof this.mapping[property].name !== 'NumberType';

      // Ensure that we have an operator, we just assume anything specified
      // without an operator is equality
      if (!(op instanceof Entity.op)) {
        op = Entity.op.equal(op);
      }

      if (this.__partitionKey.key === property) {
        return `partition_key ${op.operator} ${shouldAddQuotes ? `'${op.operand}'` : op.operand}`;
      }

      if (this.__rowKey.key === property) {
        return `row_key ${op.operator} ${shouldAddQuotes ? `'${op.operand}'` : op.operand}`;
      }

      const operandValue = valueFromOperand(op.operand);

      return `value ->> '${property}' ${op.operator} ${shouldAddQuotes ? `'${operandValue}'` : operandValue}`;
    }).join(' and ');

    if (options.matchPartition === 'exact') {
      assert(/partition_key/.test(condition), 'conditions should provide enough constraints for constructions of the partition key');
    }

    return condition;
  }

  static calculateId(properties) {
    return {
      partitionKey: this.__partitionKey.exact(properties),
      rowKey: this.__rowKey.exact(properties),
    }
  }

  static serialize(properties) {
    const {partitionKey, rowKey} = this.calculateId(properties);
    const entity = {
      PartitionKey: partitionKey,
      RowKey: rowKey,
      Version: this.version,
    };

    Object.entries(this.mapping).forEach(([key, keytype]) => {
      keytype.serialize(entity, properties[key], this.__cryptoKey);
    });

    if (this.__sign) {
      entity.Signature = this.__sign.call(this, properties).toString('base64');
    }

    return entity;
  }

  deserialize(entity) {
    const deserializedProperties = {};

    Object.entries(this.constructor.mapping).forEach(([key, keytype]) => {
      deserializedProperties[key] = keytype.deserialize(entity, this.constructor.__cryptoKey);
    });

    if (this.constructor.__hasSigning) {
      const signature = Buffer.from(entity.Signature, 'base64');

      if (!fixedTimeComparison(signature, this.constructor.__sign(deserializedProperties))) {
        throw new Error('Signature validation failed!');
      }
    }

    return deserializedProperties;
  }

  static async create(properties, overwrite) {
    const { partitionKey, rowKey } = this.calculateId(properties);

    const entity = this.serialize(properties);

    let res;
    try {
      res = await this.db.fns[`${this.tableName}_create`](partitionKey, rowKey, entity, overwrite, 1);
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

    return new this(entity, {
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
      matchPartition = 'none',
    } = options;
    const condition = this._doCondition(conditions, options);
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
    const opts = {
      ...options,
      matchPartition: 'exact',
    };

    return this.scan(conditions, opts);
  }

  static configure(configureOptions) {
    class ConfiguredEntity extends Entity {
      static setup(setupOptions) {
        const {
          tableName,
          db,
          serviceName,
        } = setupOptions;

        if (ConfiguredEntity.__hasEncrypted) {
          assert(typeof setupOptions.cryptoKey === 'string',
            'cryptoKey is required when a property is encrypted in any ' +
            'of the schema versions.');
          const secret  = Buffer.from(setupOptions.cryptoKey, 'base64');
          assert(secret.length === 32, 'cryptoKey must be 32 bytes in base64');
          ConfiguredEntity.__cryptoKey = secret;
        } else {
          assert(!setupOptions.cryptoKey, 'Don\'t specify options.cryptoKey when ' +
            'there aren\'t any encrypted properties!');
        }

        if (ConfiguredEntity.__hasSigning) {
          assert(typeof setupOptions.signingKey === 'string',
            'signingKey is required when {signEntities: true} is set in ' +
            'one of the versions of the Entity versions');
          ConfiguredEntity.__signingKey = Buffer.from(setupOptions.signingKey, 'utf8');
        } else {
          assert(!setupOptions.signingKey, 'Don\'t specify options.signingKey when '  +
            'entities aren\'t signed!');
        }

        ConfiguredEntity.contextEntries = ConfiguredEntity._getContextEntries(
          configureOptions.context || [],
          setupOptions.context || {});
        ConfiguredEntity.tableName = tableName;
        ConfiguredEntity.serviceName = serviceName;
        ConfiguredEntity.db = db;

        return ConfiguredEntity;
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

    const hasEncrypted = Object.values(ConfiguredEntity.mapping)
      .some(({ isEncrypted }) => isEncrypted);
    const hasSigning = configureOptions.signEntities === true;

    if (hasEncrypted) {
      ConfiguredEntity.__hasEncrypted = true;
    }

    if (hasSigning) {
      ConfiguredEntity.__hasSigning = true;

      // Order keys for consistency
      const keys = _.keys(ConfiguredEntity.mapping).sort();

      ConfiguredEntity.__sign = function(properties) {
        const hash  = crypto.createHmac('sha512', this.__signingKey);
        const buf   = Buffer.alloc(4);
        const n     = keys.length;
        for (let i = 0; i < n; i++) {
          const property = keys[i];
          const type = ConfiguredEntity.mapping[property];
          const value = type.hash(properties[property]);

          // Hash [uint32 - len(property)] [bytes - property]
          buf.writeUInt32BE(Buffer.byteLength(property, 'utf8'), 0);
          hash.update(buf, 'utf8');
          hash.update(property, 'utf8');

          // Hash [uint32 - len(value)] [bytes - value]
          let len;
          if (typeof value === 'string') {
            len = Buffer.byteLength(value, 'utf8');
          } else {
            len = value.length;
          }
          buf.writeUInt32BE(len, 0);
          hash.update(buf);
          hash.update(value, 'utf8');
        }
        return hash.digest();
      };
    }

    ConfiguredEntity.__partitionKey = configureOptions.partitionKey(ConfiguredEntity.mapping);
    ConfiguredEntity.__rowKey = configureOptions.rowKey(ConfiguredEntity.mapping);
    // TODO: more configureOptions
    return ConfiguredEntity;
  }
}

module.exports = {
  Entity,
};
