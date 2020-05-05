const assert = require('assert').strict;
const _ = require('lodash');
const op = require('./entityops');
const types = require('./entitytypes');
const keys = require('./entitykeys');
const {
  UNIQUE_VIOLATION,
} = require('taskcluster-lib-postgres');
const crypto = require('crypto');
const Hashids = require('hashids/cjs');
const { snakeCase } = require('change-case');
const {
  VALID_ROW_MATCH,
  VALID_PARTITION_MATCH,
  MAX_MODIFY_ATTEMPTS,
  CONTINUATION_TOKEN_PATTERN,
} = require('./constants');

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

  for (let i = 0; i < n; i++) {
    mismatch |= b1[i] ^ b2[i];
  }

  return mismatch === 0;
};

const decodeContinuationToken = token => {
  const hashids = new Hashids();
  const decodedToken = hashids.decode(token);

  if (!decodedToken.length) {
    return 0;
  }

  return decodedToken[0];
};

const encodeContinuationToken = token => {
  const hashids = new Hashids();

  if (!token) {
    return null;
  }

  return hashids.encode(token, 10);
};

const makeError = (message, code, statusCode) => {
  const err = new Error(message);
  err.code = code;
  err.name = `${code}Error`;
  err.statusCode = statusCode;
  return err;
};

const make404 = () => makeError('Resource not found', 'ResourceNotFound', 404);

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

    this._etag = etag;
    this._tableName = tableName;
    this._partitionKey = entity.PartitionKey;
    this._rowKey = entity.RowKey;
    this._db = db;

    this._getPropertiesFromEntity(entity);

    Object.entries(context).forEach(([key, value]) => {
      this[key] = value;
    });
  }

  _getPropertiesFromEntity(entity) {
    this._properties = this.deserialize(entity);
  }

  async remove(ignoreChanges, ignoreIfNotExists) {
    const [result] = await this._db.fns[`${this._tableName}_remove`](this._partitionKey, this._rowKey);

    if (result) {
      return true;
    }

    if (ignoreIfNotExists && !result) {
      return false;
    }

    if (!result) {
      throw make404();
    }
  }

  // load the properties from the table once more, and return true if anything has changed.
  // Else, return false.
  async reload() {
    const result = await this._db.fns[`${this._tableName}_load`](this._partitionKey, this._rowKey);
    const etag = result[0].etag;
    const hasChanged = etag !== this._etag;

    this._getPropertiesFromEntity(result[0].value);
    this._etag = etag;

    return hasChanged;
  }

  async modify(modifier) {
    let attemptsLeft = MAX_MODIFY_ATTEMPTS;

    const attemptModify = async () => {
      const newProperties = _.cloneDeep(this._properties);
      let entity;
      let result;
      await modifier.call(newProperties, newProperties);

      assert(
        this._rowKey === this.constructor.__rowKey.exact(newProperties),
        `You can't modify elements of the rowKey`,
      );
      assert(
        this._partitionKey === this.constructor.__partitionKey.exact(newProperties),
        `You can't modify elements of the partitionKey`,
      );

      if (!_.isEqual(newProperties, this._properties)) {
        try {
          entity = this.constructor.serialize(newProperties);
          [result] = await this._db.fns[`${this._tableName}_modify`](this._partitionKey, this._rowKey, entity, 1, this._etag);
        } catch (e) {
          if (e.code === 'P0004') {
            return null;
          }

          if (e.code === 'P0002') {
            throw make404();
          }

          throw e;
        }

        this._getPropertiesFromEntity(entity);
        this._etag = result.etag;
      }

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
      const err = makeError('MAX_MODIFY_ATTEMPTS exhausted, check for congestion', 'EntityWriteCongestionError', 409);
      err.originalEntity = this._properties;
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
    const result = { partitionKey: null, rowKey: null, condition: null };
    const valueFromOperand = (type, operand) => {
      // SECURITY-CRITICAL: We only support conditions on dates, as they cannot
      // be used to inject SQL -- `Date.toJSON` always produces a simple string
      // with no SQL metacharacters.  An analysis of all call-sites of the scan
      // method suggests this is all that will be required, and the few calls
      // with other types can be rewritten to check the condition on the
      // results of scan.  Consider carefully before adding additional accepted
      // types here, and DO NOT ADD 'string'.
      if (operand instanceof Date) {
        return `'${operand.toJSON()}'`;
      }

      throw new Error('condition operand can only be a date');
    };

    if (!conditions) {
      return result;
    }

    if (conditions) {
      assert(typeof conditions === 'object' && conditions.constructor === Object, 'conditions should be an object');
    }

    let pk;
    let rk;
    let condition = [];
    let covered = [];

    try {
      pk = this.__partitionKey.exactFromConditions(conditions);
    } catch (e) {
      if (options.matchPartition === 'exact') {
        assert(pk, 'conditions should provide enough constraints for constructions of the partition key');
      }
    }

    try {
      rk = this.__rowKey.exactFromConditions(conditions);
    } catch (e) {
      if (options.matchRow === 'exact') {
        assert(rk, 'conditions should provide enough constraints for constructions of the row key');
      }
    }

    if (pk) {
      covered.push(...this.__partitionKey.covers);
      result.partitionKey = pk;
    }

    if (rk) {
      covered.push(...this.__rowKey.covers);
      result.rowKey = rk;
    }

    Object.entries(conditions).forEach(([property, op]) => {
      // Ensure that we have an operator, we just assume anything specified
      // without an operator is equality
      if (!(op instanceof Entity.op)) {
        op = Entity.op.equal(op);
      }

      if (!covered.includes(property)) {
        const operandValue = valueFromOperand(this.mapping[property], op.operand);
        // SECURITY-CRITICAL: We're injecting raw values into a string that
        // will be used as raw SQL (by the TABLENAME_scan stored function).
        // Here's why this is safe:
        //  - this entire library is for backward compatibility and only for use
        //    within the TC services, so we can easily examine every call site,
        //    and do not expect those call sites to change except in a rewrite to
        //    no longer use this library.
        //  - property is hard-coded in the call site
        //  - op.operator is a constant from `entityops.js`
        //  - operandValue comes from valueFromOperand, above, which has a big
        //    warning on it.
        condition.push(`value ->> '${property}' ${op.operator} ${operandValue}`);
      }
    });

    result.condition = condition.join(' and ') || null;

    return result;
  }

  static calculateId(properties) {
    return {
      partitionKey: this.__partitionKey.exact(properties),
      rowKey: this.__rowKey.exact(properties),
    };
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

    assert(entity.PartitionKey, "entity has no PartitionKey in value");
    assert(entity.RowKey, "enitity has no RowKey in value");

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
      res = await this._db.fns[`${this._tableName}_create`](partitionKey, rowKey, entity, overwrite, 1);
    } catch (err) {
      if (err.code === UNIQUE_VIOLATION) {
        const e = makeError('Entity already exists', 'EntityAlreadyExists', 409);
        throw e;
      }

      throw err;
    }

    const etag = res[0][`${this._tableName}_create`];

    return new this(entity, {
      etag,
      tableName: this._tableName,
      partitionKey,
      rowKey,
      db: this._db,
      context: this.contextEntries,
    });
  }

  /* NOOP */
  static async removeTable() {}

  /* NOOP */
  static async ensureTable() {}

  static async remove(properties, ignoreIfNotExists) {
    const { partitionKey, rowKey } = this.calculateId(properties);
    const [result] = await this._db.fns[`${this._tableName}_remove`](partitionKey, rowKey);

    if (result) {
      return true;
    }

    if (ignoreIfNotExists && !result) {
      return false;
    }

    if (!result) {
      throw make404();
    }
  }

  static async load(properties, ignoreIfNotExists) {
    const { partitionKey, rowKey } = this.calculateId(properties);
    const [result] = await this._db.fns[`${this._tableName}_load`](partitionKey, rowKey);

    if (!result && ignoreIfNotExists) {
      return null;
    }

    if (!result) {
      throw make404();
    }

    return new this(result.value, {
      etag: result.etag,
      tableName: this._tableName,
      partitionKey,
      rowKey,
      db: this._db,
      context: this.contextEntries,
    });
  }

  static async scan(conditions, options = {}) {
    const {
      continuation,
      handler,
      limit = 1000,
      matchPartition = 'none',
      matchRow = 'none',
    } = options;
    assert(VALID_PARTITION_MATCH.indexOf(matchPartition) !== -1,
      'Valid values for \'matchPartition\' are: none, exact');
    assert(VALID_ROW_MATCH.indexOf(matchRow) !== -1,
      'Valid values for \'matchRow\' are: none, partial, exact');
    assert(!handler || handler instanceof Function,
      'If options.handler is given it must be a function');
    assert(limit === undefined ||
      typeof limit === 'number', 'options.limit must be a number');

    const fetchResults = async (continuation) => {
      const offset = decodeContinuationToken(continuation);
      const { partitionKey, rowKey, condition } = this._doCondition(conditions, options);
      const size = Math.min(limit, 1000);
      const result = await this._db.fns[`${this._tableName}_scan`](partitionKey, rowKey, condition, size, offset);
      let hasNextPage;

      if (result.length > size) {
        hasNextPage = true;
        // remove last element in place from list
        result.splice(-1);
      } else {
        hasNextPage = false;
      }

      const entries = result.map(entry => (
        new this(entry.value, {
          etag: entry.etag,
          tableName: this._tableName,
          partitionKey: entry.partition_key,
          rowKey: entry.row_key,
          db: this._db,
          context: this.contextEntries,
        })
      ));
      const contToken = hasNextPage ? offset + result.length : null;

      return { entries, continuation: encodeContinuationToken(contToken) };
    };

    // Fetch results
    let results = await fetchResults(continuation);

    // If we have a handler, then we have to handle the results
    if (handler) {
      const handleResults = async (res) => {
        await Promise.all(res.entries.map((item) => { return handler.call(this, item); }));

        if (res.continuation) {
          return await handleResults(await fetchResults(res.continuation));
        }
      };
      results = await handleResults(results);
    }
    return results;
  }

  static query(conditions, options = {}) {
    const opts = {
      ...options,
      matchPartition: 'exact',
    };

    return this.scan(conditions, opts);
  }

  static configure(configureOptions) {
    class ConfiguredEntity extends this {
      static setup(setupOptions) {
        const {
          tableName,
          db,
          serviceName,
          monitor,
        } = setupOptions;

        class subClass extends ConfiguredEntity {}

        if (ConfiguredEntity.__hasEncrypted) {
          assert(typeof setupOptions.cryptoKey === 'string',
            'cryptoKey is required when a property is encrypted in any ' +
            'of the schema versions.');
          const secret = Buffer.from(setupOptions.cryptoKey, 'base64');
          assert(secret.length === 32, 'cryptoKey must be 32 bytes in base64');
          subClass.__cryptoKey = secret;
        } else {
          assert(!setupOptions.cryptoKey, 'Don\'t specify options.cryptoKey when ' +
            'there aren\'t any encrypted properties!');
        }

        if (ConfiguredEntity.__hasSigning) {
          assert(typeof setupOptions.signingKey === 'string',
            'signingKey is required when {signEntities: true} is set in ' +
            'one of the versions of the Entity versions');
          subClass.__signingKey = Buffer.from(setupOptions.signingKey, 'utf8');
        } else {
          assert(!setupOptions.signingKey, 'Don\'t specify options.signingKey when ' +
            'entities aren\'t signed!');
        }

        subClass.contextEntries = ConfiguredEntity._getContextEntries(
          configureOptions.context || [],
          setupOptions.context || {});
        subClass._tableName = tableName;
        subClass.serviceName = serviceName;
        subClass._db = db;
        subClass.monitor = monitor;

        Object.entries(subClass.contextEntries).forEach(([key, value]) => {
          subClass[key] = value;
        });

        // Define access properties, we do this here, as doing it in Entity.configure
        // means that it could be called more than once.
        _.forIn(ConfiguredEntity.mapping, function(type, property) {
          // Define property for accessing underlying shadow object
          Object.defineProperty(subClass.prototype, property, {
            enumerable: true,
            get: function() {
              return this._properties[property];
            },
          });
        });

        return subClass;
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
        const hash = crypto.createHmac('sha512', this.__signingKey);
        const buf = Buffer.alloc(4);
        const n = keys.length;
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

    // If version 1, then we save the partition/row-keys definitions
    if (configureOptions.version === 1) {
      assert(configureOptions.partitionKey, 'partitionKey is required in version 1');
      assert(configureOptions.rowKey, 'rowKey is required in version 1');
      ConfiguredEntity.__partitionKeyDefinition = configureOptions.partitionKey;
      ConfiguredEntity.__rowKeyDefinition = configureOptions.rowKey;
    } else {
      assert(!configureOptions.partitionKey, 'You can\'t redefine the partitionKey');
      assert(!configureOptions.rowKey, 'You can\'t redefine the rowKey');
    }

    ConfiguredEntity.__partitionKey = ConfiguredEntity.__partitionKeyDefinition(ConfiguredEntity.mapping);
    ConfiguredEntity.__rowKey = ConfiguredEntity.__rowKeyDefinition(ConfiguredEntity.mapping);

    return ConfiguredEntity;
  }
}

Entity.op = op;
Entity.keys = keys;
Entity.types = types;
Entity.continuationTokenPattern = CONTINUATION_TOKEN_PATTERN;

// due to some differences in different versions of change-case, we
// have some special-cases.  Everything else follows change-case's
// snakeCase.
const POSTGRES_TABLE_NAMES = {
  LastFire3: 'last_fire_3',
  WMWorkers: 'wmworkers',
  WMWorkerPools: 'wmworker_pools',
  WMWorkerPoolErrors: 'wmworker_pool_errors',
};
Entity.postgresTableName = azureTableName =>
  `${POSTGRES_TABLE_NAMES[azureTableName] || snakeCase(azureTableName)}_entities`;

module.exports = Entity;
