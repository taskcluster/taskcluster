"use strict";

var assert          = require('assert');
var util            = require('util');
var slugid          = require('slugid');
var _               = require('lodash');
var Promise         = require('promise');
var debug           = require('debug')('base:entity');
var azureTable      = require('azure-table-node');
var azure           = require('fast-azure-storage');
var taskcluster     = require('taskcluster-client');
var https           = require('https');
var stats           = require('../stats');
var AzureAgent      = require('./azureagent');

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


/** List of property names reserved or conflicting with method names */
var RESERVED_PROPERTY_NAMES = [
  // Reserved by Azure Table Storage
  'PartitionKey',
  'RowKey',
  'Timestamp',

  // Reserved for internal use
  'Version',

  // Properties built-in to expose built-in properties
  'version',

  // Methods implemented by `Entity`
  'modify',
  'remove'
];

/**
 * Max number of modify attempts to make when experiencing collisions with
 * optimistic concurrency.
 */
var MAX_MODIFY_ATTEMPTS     = 10;

/** Timeout for azure table requests */
var AZURE_TABLE_TIMEOUT     = 7 * 1000;

/** Statistics from Azure table operations */
var AzureTableOperations = new stats.Series({
  name:             'AzureTableOperations',
  columns: {
    component:      stats.types.String,
    process:        stats.types.String,
    duration:       stats.types.Number,
    table:          stats.types.String,
    method:         stats.types.String,
    error:          stats.types.String
  }
});

/**
 * Base class of all entity
 *
 * This constructor will wrap a raw azure-table-node entity.
 */
var Entity = function(entity) {
  assert(entity.PartitionKey,   "entity is missing 'PartitionKey'");
  assert(entity.RowKey,         "entity is missing 'RowKey'");
  assert(entity['odata.etag'],  "entity is missing 'odata.etag'");
  assert(entity.Version,        "entity is missing 'Version'");

  this._partitionKey  = entity.PartitionKey;
  this._rowKey        = entity.RowKey;
  this._version       = entity.Version;
  this._properties    = this.__deserialize(entity);
  this._etag          = entity['odata.etag'];
};

// Built-in type handlers
Entity.types  = require('./entitytypes');

// Built-in key handlers
Entity.keys   = require('./entitykeys');

// Built-in operator definitions
Entity.op     = require('./entityops');

// Define properties set in the first configure call only
Entity.prototype.__partitionKeyDefinition     = undefined;
Entity.prototype.__rowKeyDefinition           = undefined;
Entity.prototype.__lockedPropertiesDefinition = undefined;

// Define properties set in configure
Entity.prototype.__context      = undefined;  // List of required context keys
Entity.prototype.__deserialize  = undefined;  // Method to deserialize entities
Entity.prototype.__serialize    = undefined;  // Method to serialize entities
Entity.prototype.__mapping      = undefined;  // Schema mapping to types
Entity.prototype.__version      = 0;          // Schema version
Entity.prototype.__partitionKey = undefined;  // PartitionKey builder
Entity.prototype.__rowKey       = undefined;  // RowKey builder

// Define properties set in
Entity.prototype.__client       = undefined;  // Azure table client
Entity.prototype.__aux          = undefined;  // Azure table client wrapper
Entity.prototype.__table        = undefined;  // Azure table name

// Define properties set in constructor
Entity.prototype._properties    = undefined;  // Deserialized shadow object
Entity.prototype._partitionKey  = undefined;  // Entity partition key
Entity.prototype._rowKey        = undefined;  // Entity row key
Entity.prototype._version       = undefined;  // Schema version of remote entity
Entity.prototype._etag          = undefined;  // Etag of remote entity

/**
 * Create a promise handler that will pass arguments + err to debug()
 * and rethrow err. This is useful as handler for .catch()
 */
var rethrowDebug = function() {
  var args = arguments;
  return function(err) {
    var params = Array.prototype.slice.call(args);
    params.push(err);
    debug.apply(debug, params);
    throw err;
  };
};

/**
 * Create a promise handler that will wrap the resulting entity in `Class`.
 * This is useful as handler for .then()
 */
var wrapEntityClass = function(Class) {
  return function(entity) {
    return new Class(entity);
  };
};

/**
 * Configure a subclass of `this` (`Entity` or subclass thereof) with following
 * options:
 * {
 *   // Storage schema details (typically configured statically)
 *   version:           2,                    // Version of the schema
 *   partitionKey:      Entity.HashKey('p1'), // Partition key, can be StringKey
 *   rowKey:            Entity.StringKey('p2', 'p3'), // RowKey...
 *   properties: {
 *     prop1:           Entity.types.Blob,    // Properties and types
 *     prop2:           Entity.types.String,
 *     prop3:           Entity.types.Number,
 *     prop4:           Entity.types.JSON
 *   },
 *   context: [                               // Required context keys
 *     'prop5'                                // Constant specified in setup()
 *   ],
 *   migrate: function(itemV1) {              // Migration function, if not v1
 *     return // transform item from version 1 to version 2
 *   },
 * }
 *
 * When creating a subclass of `Entity` using this method, you must provide all
 * options before you try to call `Entity.setup` and is able to initialize
 * instances of the subclass. You may create a subclass hierarchy and call
 * configure multiple times to allow for additional versions.
 *
 * When creating a subclass using `configure` all the class properties and
 * class members (read static functions like `Entity.configure`) will also be
 * inherited. So it is possible to do as follows:
 *
 * ```js
 * // Create an abstract key-value pair
 * var AbstractKeyValue = Entity.configure({
 *   version:     1,
 *   partitionKey:    Entity.StringKey('key'),
 *   rowKey:          Entity.ConstantKey('kv-pair'),
 *   properties: {
 *     key:           Entity.types.String,
 *     value:         Entity.types.JSON
 *   }
 * });
 *
 * // Overwrite the previous definition AbstractKeyValue with a new version
 * AbstractKeyValue = AbstractKeyValue.configure({
 *   version:         2,
 *   partitionKey:    Entity.StringKey('key'),
 *   rowKey:          Entity.ConstantKey('kv-pair'),
 *   properties: {
 *     key:           Entity.types.String,
 *     date:          Entity.types.Date
 *   },
 *   migrate: function(item) {
 *     // Translate from version 1 to version 2
 *     return {
 *       key:      item.key,
 *       date:     new Date(item.value.StringDate)
 *     };
 *   }
 * });
 *
 * // Return a pair from the key-value pair
 * AbstractKeyValue.pair = function() {
 *   return [this.key, this.date];
 * };

 * // Create one key-value entity table
 * var KeyValue1 = AbstractKeyValue.setup({
 *   credentials:    {...},
 *   table:          "KeyValueTable1"
 * });

 * // Create another key-value entity table
 * var KeyValue2 = AbstractKeyValue.setup({
 *   credentials:    {...},
 *   table:          "KeyValueTable2"
 * });
 * ```
 *
 * As illustrated above you can use `configure` to have multiple instantiations
 * of the same Entity configuration. In addition `configure` can also be used
 * define newer revisions of the schema. When doing this, you must base it on
 * the previous version, and you must increment version number by 1 and only 1.
 *
 * It's your responsibility that `partitionKey` and `rowKey` will keep
 * returning the same value, otherwise you cannot migrate entities on-the-fly,
 * but must take your application off-line while you upgrade the data schema.
 * Or start submitting data to an additional table, while you're migrating
 * existing data in an off-line process.
 *
 * Typically, `Entity.configure` will be used in a module to create a subclass
 * of Entity with neat auxiliary static class methods and useful members, then
 * this abstract type will again be sub-classed using `setup` with connection
 * credentials and table name. This allows for multiple tables with the same
 * abstract definition, and improves testability by removing configuration
 * from global module scope.
 *
 * Notice that it is possible to require custom context properties to be
 * injected with `Entity.setup` using the `context` option. This option takes
 * a list of property names. These property names must then be specified with
 * `Entity.setup({context: {myProp: ...}})`. This is a good way to inject
 * configuration keys and constants for use in Entity instance methods.
 */
Entity.configure = function(options) {
  assert(options,                                 "options must be given");
  assert(typeof(options.version) === 'number',    "version must be a number");
  assert(typeof(options.properties) === 'object', "properties must be given");
  options = _.defaults({}, options, {
    context:      []
  });
  assert(options.context instanceof Array,        "context must be an array");

  // Identify the parent class, that is always `this` so we can use it on
  // subclasses
  var Parent = this;

  // Create a subclass of Parent
  var subClass = function(entity) {
    // Always pass down the entity we're initializing from
    Parent.call(this, entity);
  };
  util.inherits(subClass, Parent);

  // Inherit class methods too (ie. static members)
  _.assign(subClass, Parent);

  // Validate options.context
  options.context.forEach(function(key) {
    assert(typeof(key) === 'string',
           "elements of options.context must be strings");
    assert(RESERVED_PROPERTY_NAMES.indexOf(key) === -1,
           "Property name '" + key + "' is reserved, and cannot be specified " +
           "in options.context");
    assert(options.properties[key] === undefined,
           "Property name '" + key + "' is defined 'properties' and cannot " +
           "be specified in options.context");
  });
  // Store context for validation of context given in Entity.setup()
  subClass.prototype.__context = options.context.slice();

  // Validate property names
  _.forIn(options.properties, function(Type, property) {
    assert(RESERVED_PROPERTY_NAMES.indexOf(property) === -1,
           "Property name '" + property + "' is reserved");
    assert(!/^__/.test(property),         "Names prefixed '__' is reserved");
    assert(/^[a-zA-Z_-][a-zA-Z0-9_-]*$/.test(property),
           "Property name '" + property + "' is not a proper identifier");
  });

  // Don't allow configure to run after setup, there is no reasons for this.
  // In particular it will give issues access properties when new versions
  // are introduced. Mainly that empty properties will exist.
  assert(
    subClass.prototype.__client === undefined &&
    subClass.prototype.__aux    === undefined &&
    subClass.prototype.__table  === undefined,
    "This `Entity` subclass is already setup!"
  );

  // Check that version in incremented by 1
  assert(options.version === subClass.prototype.__version + 1,
         "`version` must be incremented by 1 (and only 1)");

  // Construct mapping
  var mapping = {};
  _.forIn(options.properties, function(Type, property) {
    if (!(Type instanceof Function)) {
      throw new Error("Type for '" + property + "' does not exist!");
    }
    mapping[property] = new Type(property);
  });
  subClass.prototype.__mapping = mapping;

  // If version 1, then we save the partition/row-keys definitions
  if (options.version === 1) {
    assert(options.partitionKey, "partitionKey is required in version 1");
    assert(options.rowKey,       "rowKey is required in version 1");
    subClass.prototype.__partitionKeyDefinition = options.partitionKey;
    subClass.prototype.__rowKeyDefinition       = options.rowKey;
  } else {
    assert(!options.partitionKey, "You can't redefine the partitionKey");
    assert(!options.rowKey,       "You can't redefine the rowKey");
  }

  // Construct __partitionKey and __rowKey from definitions with new mapping
  var partitionKeyDefinition  = subClass.prototype.__partitionKeyDefinition;
  var rowKeyDefinition        = subClass.prototype.__rowKeyDefinition;
  subClass.prototype.__partitionKey = partitionKeyDefinition(mapping);
  subClass.prototype.__rowKey       = rowKeyDefinition(mapping);

  // Find properties used in partition and row keys, then declared to locked
  // and validate that they are present
  if (options.version === 1) {
    var propertiesToLock = subClass.prototype.__partitionKey.covers.concat(
      subClass.prototype.__rowKey.covers
    );
    var lockedProperties = {};
    propertiesToLock.forEach(function(property) {
      assert(options.properties[property], "Property '" + property +
             "' referenced in partition/row key(s) must be defined");
      lockedProperties[property] = options.properties[property];
    });
    // Store set of locked properties, so that we can validate their type and
    // definition for each new version that is configured
    subClass.prototype.__lockedPropertiesDefinition = lockedProperties;
  }

  // Validate that locked properties haven't changed
  if (options.version > 1) {
    var lockedProperties = subClass.prototype.__lockedPropertiesDefinition;
    _.forIn(lockedProperties, function(type, property) {
      assert(options.properties[property] === type,
             "Type of property: '" + property + "' referenced in " +
             "partition/row key cannot be changed during migration!");
    });
  }

  // define __deserialize in two ways
  if (options.version === 1) {
    // If version is 1, we just assert that an deserialize properties
    subClass.prototype.__deserialize = function(entity) {
      assert(entity.Version === 1, "entity.Version isn't 1");
      var properties = {};
      _.forIn(mapping, function(type, property) {
        properties[property] = type.deserialize(entity);
      });
      return properties;
    };
  } else {
    assert(options.migrate instanceof Function,
           "`migrate` must be specified for version > 1");
    // if version is > 1, then we remember the deserializer from version - 1
    // if version of the entity we get is < version, then we call the old
    // `deserialize` method (hence, why we keep a reference to it).
    var deserialize = subClass.prototype.__deserialize;
    subClass.prototype.__deserialize = function(entity) {
      // Validate version
      assert(entity.Version <= options.version,
             "entity.Version is greater than configured version!");
      // Migrate, if necessary
      if (entity.Version < options.version) {
        return options.migrate.call(this, deserialize(entity));
      }
      // Deserialize properties, if not migrated
      var properties = {};
      _.forIn(mapping, function(type, property) {
        properties[property] = type.deserialize(entity);
      });
      return properties;
    };
  }

  // Set version
  subClass.prototype.__version = options.version;

  // define __serialize
  subClass.prototype.__serialize = function(properties) {
    var entity = {
      PartitionKey: subClass.prototype.__partitionKey.exact(properties),
      RowKey:       subClass.prototype.__rowKey.exact(properties),
      Version:      subClass.prototype.__version
    };
    _.forIn(mapping, function(type, property) {
      type.serialize(entity, properties[property]);
    });
    return entity;
  };

  // Return subClass
  return subClass;
};


/**
 * Setup a subclass of `this` (`Entity` or subclass thereof) for use, with
 * the following options:
 * {
 *   // Azure connection details for use with SAS from auth.taskcluster.net
 *   account:           "...",              // Azure storage account name
 *   table:             "AzureTableName",   // Azure table name
 *   // TaskCluster credentials
 *   credentials: {
 *     clientId:        "...",              // TaskCluster clientId
 *     accessToken:     "...",              // TaskCluster accessToken
 *   },
 *   agent:             https.Agent,        // Agent to use (default AzureAgent)
 *   authBaseUrl:       "...",              // baseUrl for auth (optional)
 *   drain:             base.stats.Influx,  // Statistics drain (optional)
 *   component:         '<name>',           // Component in stats (if drain)
 *   process:           'server',           // Process in stats (if drain)
 *   context:           {...}               // Extend prototype (optional)
 * }
 *
 * Using the `options` format provided above a shared-access-signature will be
 * fetched from auth.taskcluster.net. The goal with this is to reduce secret
 * configuration and reduce exposure of our Azure `accountKey`. To fetch the
 * shared-access-signature the following scope is required:
 *   `auth:azure-table-access:<accountName>/<table>`
 *
 * If you have the azure credentials, you can also specify the options
 * as follows:
 * {
 *   // Azure connection details
 *   table:             "AzureTableName",   // Azure table name
 *   // Azure credentials
 *   credentials: {
 *     accountName:     "...",              // Azure account name
 *     accountKey:      "...",              // Azure account key
 *   },
 * }
 *
 * In `Entity.configure` the `context` options is a list of property names,
 * these properties **must** be specified in when `Entity.setup` is called.
 * They will be used to extend the subclass prototype. This is typically used
 * to inject configuration constants for use in Entity instance methods.
 *
 * Once you have configured properties, version, migration, keys, using
 * `Entity.configure`, you can call `Entity.setup` on your new subclass.
 * This will again create a new subclass that is ready for use, with azure
 * credentials, etc. This new subclass cannot be configured further, nor can
 * `setup` be called again.
 */
Entity.setup = function(options) {
  // Validate options
  assert(options,                             "options must be given");
  assert(options.table,                       "options.table must be given");
  assert(typeof(options.table) === 'string',  "options.table isn't a string");
  assert(options.credentials,                 "credentials is required");
  assert(!options.drain || options.component, "component is required if drain");
  assert(!options.drain || options.process,   "process is required if drain");
  options = _.defaults({}, options, {
    context:          {},
    agent:            undefined,
    minSASAuthExpiry: 15 * 60 * 1000
  });

  // Identify the parent class, that is always `this` so we can use it on
  // subclasses
  var Parent = this;

  // Create a subclass of Parent
  var subClass = function(entity) {
    // Always pass down the entity we're initializing from
    Parent.call(this, entity);
  };
  util.inherits(subClass, Parent);

  // Inherit class methods too (ie. static members)
  _.assign(subClass, Parent);

  // Validate that subclass is already configured
  assert(
    subClass.prototype.__version      &&
    subClass.prototype.__mapping      &&
    subClass.prototype.__deserialize  &&
    subClass.prototype.__partitionKey &&
    subClass.prototype.__rowKey,
    "Must be configured first, see `Entity.configure`"
  );

  // Don't allow setup to run twice, there is no reasons for this. In particular
  // it could give issues with access properties
  assert(
    subClass.prototype.__client === undefined &&
    subClass.prototype.__aux    === undefined &&
    subClass.prototype.__table  === undefined,
    "This `Entity` subclass is already setup!"
  );

  // Define access properties, we do this here, as doing it in Entity.configure
  // means that it could be called more than once. When subclassing with new
  // versions, we don't really want that.
  _.forIn(subClass.prototype.__mapping, function(type, property) {
    // Define property for accessing underlying shadow object
    Object.defineProperty(subClass.prototype, property, {
      enumerable: true,
      get:        function() {return this._properties[property];}
    });
  });

  // Validate that we have all context properties required
  subClass.prototype.__context.forEach(function(key) {
    assert(options.context[key] !== undefined, "Context key '" + key +
           "' must be specified!");
  });

  // Set properties from options.context
  _.forIn(options.context, function(val, key) {
    assert(subClass.prototype.__context.indexOf(key) !== -1,
           "context key '" + key + "' was not declared in Entity.configure");
    subClass.prototype[key] = val;
  });

  // Set azure table name
  subClass.prototype.__table = options.table;

  // Create an azure table client
  var client = null;
  if (options.account) {
    // If we're setting up to fetch credentials for auth.taskcluster.net
    assert(typeof(options.account) === 'string',
           "Expected options.account to be a string, or undefined");
    // Create auth client to fetch SAS from auth.taskcluster.net
    var auth = new taskcluster.Auth({
      credentials:    options.credentials,
      baseUrl:        options.authBaseUrl
    });
    // Create azure table client with logic for fetch SAS
    client = new azure.Table({
      timeout:          AZURE_TABLE_TIMEOUT,
      agent:            options.agent,
      accountId:        options.account,
      minSASAuthExpiry: options.minSASAuthExpiry,
      sas: function() {
        return auth.azureTableSAS(
          options.account,
          options.table
        ).then(function(result) {
          return result.sas;
        });
      }
    });
  } else {
    // Create client using credentials already present
    assert(options.credentials.accountName, "Missing accountName");
    assert(options.credentials.accountKey ||
           options.credentials.sas,         "Missing accountKey or sas");
    // Create azure table client with accessKey
    client = new azure.Table({
      timeout:      AZURE_TABLE_TIMEOUT,
      agent:        options.agent,
      accountId:    options.credentials.accountName,
      accessKey:    options.credentials.accountKey,
      sas:          options.credentials.sas
    });
  }

  // Store reference to azure table client
  subClass.prototype.__client = client;

  // Reporter for statistics
  var reporter = function() {};
  if (options.drain) {
    reporter = AzureTableOperations.reporter(options.drain);
  }

  // Create table client wrapper, to record statistics and bind table name
  subClass.prototype.__aux = {};
  [
    'createTable',
    'deleteTable',
    'getEntity',
    'queryEntities',
    'insertEntity',
    'updateEntity',
    'deleteEntity'
  ].forEach(function(name) {
    // Bind table name
    var method = client[name].bind(client, options.table);

    // Record statistics
    subClass.prototype.__aux[name] = function() {
      var start = process.hrtime();
      return method.apply(client, arguments).then(function(result) {
        var d = process.hrtime(start);
        reporter({
          component:    options.component,
          process:      options.process,
          duration:     d[0] * 1000 + (d[1] / 1000000),
          table:        options.table,
          method:       name,
          error:        'false'
        });
        return result;
      }, function(err) {
        var d = process.hrtime(start);
        reporter({
          component:    options.component,
          process:      options.process,
          duration:     d[0] * 1000 + (d[1] / 1000000),
          table:        options.table,
          method:       name,
          error:        (err ? err.code : null) || 'UnknownError'
        });
        throw err;
      });
    };
  });

  // Return subClass
  return subClass;
};

/**
 * Ensure existence of the underlying Azure Storage Table
 *
 * Remark, this doesn't work, if authenticated with SAS.
 */
Entity.ensureTable = function() {
  var Class       = this;
  var ClassProps  = Class.prototype;

  return ClassProps.__aux.createTable().catch(function(err) {
    if (!err || err.code !== 'TableAlreadyExists') {
      throw err;
    }
  }).catch(rethrowDebug(
    "ensureTable: Failed to create table '%s' with err: %j",
    ClassProps.__table
  ));
};

/**
 * Delete the underlying Azure Storage Table
 *
 * Remark, this doesn't work, if authenticated with SAS.
 */
Entity.removeTable = function() {
  var Class       = this;
  var ClassProps  = Class.prototype;

  return ClassProps.__aux.deleteTable().catch(rethrowDebug(
    "deleteTable: Failed to delete table '%s' with err: %j",
    ClassProps.__table
  ));
};

/**
 * Create an entity on azure table with property and mapping.
 * Returns a promise for an instance of `this` (typically an Entity subclass)
 */
Entity.create = function(properties, overwriteIfExists) {
  var Class       = this;
  var ClassProps  = Class.prototype;
  assert(properties, "Properties is required");

  // Serialize entity
  var entity = ClassProps.__serialize(properties);

  // Insert with insertEntity or updateEntity with replace null
  var inserted = null;
  if (!overwriteIfExists) {
    inserted = ClassProps.__aux.insertEntity(entity);
  } else {
    inserted = ClassProps.__aux.updateEntity(entity, {
      mode: 'replace',
      eTag: null
    });
  }

  // Create entity
  return inserted
    .catch(rethrowDebug("Failed to insert entity err: %j"))
    .then(function(etag) {
      entity['odata.etag'] = etag;
      return entity;
    })
    .then(wrapEntityClass(Class));
};

/**
 * Load Entity subclass from azure given PartitionKey and RowKey,
 * This method return a promise for the subclass instance.
 *
 * If `ignoreIfNotExists` is true, this method will return `null` if the entity
 * to be loaded doesn't exist.
 */
Entity.load = function(properties, ignoreIfNotExists) {
  properties = properties || {};
  var Class       = this;
  var ClassProps  = Class.prototype;

  // Serialize partitionKey and rowKey
  var partitionKey  = ClassProps.__partitionKey.exact(properties);
  var rowKey        = ClassProps.__rowKey.exact(properties);

  return ClassProps.__aux.getEntity(
    partitionKey,
    rowKey
  ).then(wrapEntityClass(Class), function(err) {
    if (ignoreIfNotExists && err && err.code === 'ResourceNotFound') {
      return null; // Ignore entity that doesn't exists
    }
    throw err;
  });
};


/**
 * Remove entity without loading it. Using this method you cannot quantify about
 * the remote state you're deleting. Using `Entity.prototype.remove` removal
 * will fail, if the remove entity has been modified.
 *
 * Returns true, if an entity was deleted. Notice that it only makes sense
 * to read the return value if calling with `ignoreIfNotExists` set.
 */
Entity.remove = function(properties, ignoreIfNotExists) {
  properties = properties || {};
  var Class       = this;
  var ClassProps  = Class.prototype;

  // Serialize partitionKey and rowKey
  var partitionKey  = ClassProps.__partitionKey.exact(properties);
  var rowKey        = ClassProps.__rowKey.exact(properties);

  return ClassProps.__aux.deleteEntity(partitionKey, rowKey, {
    eTag: '*'
  }).then(function() {
    return true;
  }, function(err) {
    // Re-throw error if we're not supposed to ignore it
    if (!ignoreIfNotExists || !err || err.code !== 'ResourceNotFound') {
      throw err;
    }
    return false;
  }).catch(rethrowDebug("Failed to delete entity, err: %j"));
};


/** Remove entity if not modified, unless `ignoreChanges` is set */
Entity.prototype.remove = function(ignoreChanges, ignoreIfNotExists) {
  return this.__aux.deleteEntity(this._partitionKey, this._rowKey, {
    eTag:     (ignoreChanges ? '*' : this._etag)
  }).catch(function(err) {
    // Re-throw error if we're not supposed to ignore it
    if (!ignoreIfNotExists || !err || err.code !== 'ResourceNotFound') {
      throw err;
    }
  }).catch(rethrowDebug("Failed to delete entity, err: %j"));
};

/**
 * Update the entity by fetching its values again, returns true of there was
 * any changes.
 */
Entity.prototype.reload = function() {
  var self = this;
  var etag = this._etag;

  return this.__aux.getEntity(
    this._partitionKey,
    this._rowKey
  ).then(function(entity) {
    // Deserialize a shadow object from the entity
    self._properties    = self.__deserialize(entity);
    // Note, that Entity.prototype.modify relies on _properties becoming a new
    // object. So ensure that is maintained or updated Entity.prototype.modify

    // Set eTag and version
    self._version       = entity.Version;
    self._etag          = entity['odata.etag'];

    // Check if any properties was modified
    return self._etag !== etag;
  });
};

/**
 * Modify an entity, the `modifier` is a function that is called with
 * a clone of the entity as `this` and first argument, it should apply
 * modifications to `this` (or first argument).
 * This function shouldn't have side-effects (or these should be contained),
 * as the `modifier` may be called more than once, if the update operation
 * fails.
 *
 * This method will apply modified to a clone of the current data and attempt to
 * save it. But if this fails because the entity have been updated by another
 * process (ie. etag is out of date), it'll reload the entity from azure table.
 * invoke the modifier again and try to save again. This model fit very well
 * with the optimistic concurrency model used in Azure Table Storage.
 *
 * **Note** modifier is allowed to return a promise.
 *
 * Example:
 *
 * ```js
 * entity.modify(function() {
 *   this.property = "new value";
 * });
 * ```
 * Or using first argument, when binding modifier or using ES6 arrow-functions:
 * ```js
 * entity.modify(function(entity) {
 *   entity.property = "new value";
 * });
 * ```
 */
Entity.prototype.modify = function(modifier) {
  var self = this;

  // Create a clone of this._properties, so we can compare properties and
  // decide what to upload, as well as we can restore state if operations fail
  var properties    = {};
  _.forIn(this.__mapping, function(type, property) {
    properties[property] = type.clone(self._properties[property]);
  });
  var eTag          = this._etag;
  var version       = this._version;

  // Attempt to modify this object
  var attemptsLeft = MAX_MODIFY_ATTEMPTS;
  var attemptModify = function() {
    // Invoke modifier
    return Promise.resolve(modifier.call(
      self._properties,
      self._properties
    )).then(function() {
      var isChanged     = false;    // Track if we have changes
      var entityChanges = {};       // Track changes we have to upload
      var mode          = 'merge';  // Track update mode

      // If we don't have schema version changes
      if (self._version === self.__version) {
        // Check if `self._properties` have been changed and serialize changes
        // to `entityChanges` while flagging changes in `isChanged`
        _.forIn(self.__mapping, function(type, property) {
          var value = self._properties[property];
          if (!type.equal(properties[property], value)) {
            type.serialize(entityChanges, value);
            isChanged = true;
          }
        });
      } else {
        // If we have a schema version upgrade replace all properties
        mode          = 'replace';
        isChanged     = true;
        entityChanges = self.__serialize(self._properties);
      }

      // Check for changes
      if (!isChanged) {
        debug("Return modify trivially, as no change was applied by modifier");
        return self;
      }

      // Check for key modifications
      assert(self._partitionKey === self.__partitionKey.exact(self._properties),
             "You can't modify elements of the partitionKey");
      assert(self._rowKey === self.__rowKey.exact(self._properties),
             "You can't modify elements of the rowKey");

      // Set rowKey and partition key
      entityChanges.PartitionKey  = self._partitionKey;
      entityChanges.RowKey        = self._rowKey;

      // Update entity with changes
      return self.__aux.updateEntity(entityChanges, {
        mode:   mode,
        eTag:   self._etag
      }).then(function(eTag) {
        self._etag = eTag;
        return self;
      });
    }).catch(function(err) {
      // Restore internal state
      self._etag        = eTag;
      self._properties  = properties;
      self._version     = version;

      // rethrow error, if it's not caused by optimistic concurrency
      if (!err || err.code !== 'UpdateConditionNotSatisfied') {
        debug("Update of entity failed unexpected, err: %j", err, err.stack);
        throw err;
      }

      // Decrement number of attempts left
      attemptsLeft -= 1;
      if (attemptsLeft === 0) {
        debug("ERROR: MAX_MODIFY_ATTEMPTS exhausted, we might have congestion");
        throw new Error("MAX_MODIFY_ATTEMPTS exhausted, check for congestion");
      }

      // Reload and try again
      return Entity.prototype.reload.call(self).then(function() {
        // Attempt to modify again
        return attemptModify();
      });
    });
  };

  return attemptModify();
};


/** Encode continuation token as single string using tilde as separator */
var encodeContinuationToken = function(result) {
  if (!result.nextPartitionKey && !result.nextRowKey) {
    return null;
  }
  return (
    encodeURIComponent(result.nextPartitionKey || '').replace(/~/g, '%7e') +
    '~' +
    encodeURIComponent(result.nextRowKey || '').replace(/~/g, '%7e')
  );
};

/** Decode continuation token, inverse of encodeContinuationToken */
var decodeContinuationToken = function(token) {
  if (token === undefined || token === null) {
    return {
      nextPartitionKey: undefined,
      nextRowKey:       undefined
    };
  }
  assert(typeof(token) === 'string', "Continuation token must be a string if " +
                                     "not undefined");
  // Split at tilde (~)
  token = token.split('~');
  assert(token.length === 2, "Expected an encoded continuation token with " +
                             "a single tilde as separator");
  return {
    nextPartitionKey: decodeURIComponent(token[0]),
    nextRowKey:       decodeURIComponent(token[1])
  };
};

// Valid values for `options.matchPartition` in Entity.scan
var VALID_PARTITION_MATCH = ['exact', 'none'];

// Valid values for `options.matchRow` in Entity.scan and Entity.query
var VALID_ROW_MATCH       = ['exact', 'partial', 'none'];

/**
 *
 * Scan the entire table filtering on properties and possibly accelerated
 * with partitionKey and rowKey indexes.
 *
 * You can use this in two way, with a handler or without a handler, in which
 * case you'll get a list of up to 1000 entries and a continuation token to
 * restart the scan from.
 *
 * To scan **without a handler** call `Entity.scan(conditions, options)` as
 * illustrated below:
 *
 * ```js
 * Entity.scan({
 *   prop1:              Entity.op.equal('val1'),  // Filter on prop1 === 'val1'
 *   prop2:              "val2",                   // Same as Entity.op.equal
 *   prop3:              Entity.op.lessThan(42)    // Filter on prop3 < 42
 * }, {
 *   matchPartition:     'none',       // Require 'exact' or 'none' partitionKey
 *   matchRow:           'none',       // Require 'exact' or 'none' rowKey
 *   limit:              1000,         // Max number of entries
 *   continuation:       undefined     // Continuation token to scan from
 * }).then(function(data) {
 *   data.entries        // List of Entity
 *   data.continuation   // Continuation token, if defined
 * });
 * ```
 *
 * To scan **with a handler** call `Entity.scan(conditions, options)` as
 * follows:
 *
 * ```js
 * Entity.scan({
 *   prop1:              Entity.op.equal('val1'),  // Filter on prop1 === 'val1'
 *   prop2:              "val2",                   // Same as Entity.op.equal
 *   prop3:              Entity.op.lessThan(42)    // Filter on prop3 < 42
 * }, {
 *   continuation:       '...',        // Continuation token to continue from
 *   matchPartition:     'none',       // Require 'exact' or 'none' partitionKey
 *   matchRow:           'none',       // Require 'exact' or 'none' rowKey
 *   limit:              1000,         // Max number of parallel handler calls
 *   handler:            function(item) {
 *     return new Promise(...); // Do something with the item
 *   }
 * }).then(function() {
 *   // Done... no need to mess around with continuation tokens.
 *   // hander have been called for all entities that matched the condition.
 * });
 * ```
 *
 * **Configuring match levels**, the options `matchPartition` and `matchRow`
 * can be used specify match levels. If left as `'none'` (default), the scan
 * will not use Partition- or Row-Key indexes for acceleration.
 *
 * If you specify `matchRow: 'exact'`, conditions must contain enough equality
 * constraints to build the expected row-key, which will then be used to
 * accelerate the table scan.
 *
 * If the conditions doesn't specify enough equality constraints to build the
 * exact row-key, and error will be thrown. This allows you to reason about
 * expected performance.
 *
 * **Continuation token**, if using `Entity.scan` without a handler, you receive
 * a continuation token with your results. You can use this to continue the
 * table scan. A continuation token is a a string (that's all you need to know).
 */
Entity.scan = function(conditions, options) {
  // Set default options
  options = _.defaults(options || {}, {
    matchRow:         'none',
    matchPartition:   'none',
    handler:          null,
    limit:            undefined,
    continuation:     undefined
  });
  conditions = conditions || {};
  var Class       = this;
  var ClassProps  = Class.prototype;
  assert(VALID_PARTITION_MATCH.indexOf(options.matchPartition) !== -1,
         "Valid values for 'matchPartition' are: none, exact")
  assert(VALID_ROW_MATCH.indexOf(options.matchRow) !== -1,
         "Valid values for 'matchRow' are: none, partial, exact");
  assert(!options.handler || options.handler instanceof Function,
         "If options.handler is given it must be a function");
  assert(options.limit === undefined ||
         typeof(options.limit) === 'number', "options.limit must be a number");

  // Declare partitionKey, rowKey and covered as list of keys covered by either
  // partitionKey or rowKey
  var partitionKey  = undefined
  var rowKey        = undefined;
  var covered       = [];

  // Construct keys exact, if that is how they are required to be matched
  if (options.matchPartition === 'exact') {
    partitionKey    = ClassProps.__partitionKey.exactFromConditions(conditions);
    covered         = _.union(covered, ClassProps.__partitionKey.covers);
  }
  if (options.matchRow === 'exact') {
    rowKey          = ClassProps.__rowKey.exactFromConditions(conditions);
    covered         = _.union(covered, ClassProps.__rowKey.covers);
  }

  // Construct partial rowKey
  if (options.matchRow === 'partial') {
    // TODO: Implement partial matching, this involves prefix matching.
    //       this should be possible without changing the format for the
    //       CompositeKey, because ~ is the last character outputted by
    //       encodeStringKey. Also remember to append keys covered to the
    //       covered variable.
    throw new Error("Partial matches on rowKey is not implemented yet!");
  }

  // Create a $filter string builder to abstract away joining with 'and'
  var filter = '';
  var filterBuilder = function(condition) {
    if (filter === '') {
      filter = condition;
    } else if (condition !== '') {
      filter += ' and ' + condition;
    }
  };

  // If we have partitionKey and rowKey we should add them to the query
  var azOps = azure.Table.Operators;
  if (partitionKey !== undefined) {
    filterBuilder('PartitionKey eq ' + azOps.string(partitionKey));
  }
  if (rowKey !== undefined) {
    filterBuilder('RowKey eq ' + azOps.string(rowKey));
  }

  // Construct query from conditions using operators
  _.forIn(conditions, function(op, property) {
    // If the property is covered by the partitionKey or rowKey, we don't want
    // to apply a filter to it
    if (_.contains(covered, property)) {
      return;
    }

    // Find and check that we have a type
    var type = ClassProps.__mapping[property];
    if (!type) {
      throw new Error("Property: '" + property +
                      "' used in query is not defined!");
    }

    // Ensure that we have an operator, we just assume anything specified
    // without an operator is equality
    if (!(op instanceof Entity.op)) {
      op = Entity.op.equal(op);
    }

    // Let the type construct the filter
    type.filter(op, filterBuilder);
  });

  // Fetch results with operational continuation token
  var fetchResults = function(continuation) {
    var continuation = decodeContinuationToken(continuation);
    return ClassProps.__aux.queryEntities({
      filter:           filter,
      top:              options.limit,
      nextPartitionKey: continuation.nextPartitionKey,
      nextRowKey:       continuation.nextRowKey
    }).then(function(data) {
      return {
        entries:      data.entities.map(function(entity) {
                        return new Class(entity);
                      }),
        continuation: encodeContinuationToken(data)
      };
    });
  };

  // Fetch results
  var results = fetchResults(options.continuation);

  // If we have a handler, then we have to handle the results
  if (options.handler) {
    var handleResults = function(results) {
      return results.then(function(data) {
        return Promise.all(data.entries.map(function(item) {
          return options.handler(item);
        })).then(function() {
          if (data.continuation) {
            return handleResults(fetchResults(data.continuation));
          }
        });
      });
    };
    results = handleResults(results);
  }

  // Return result
  return results;
};

/**
 * Query a table partition.
 *
 * This is exactly the same as `Entity.scan` except `matchPartition` is set to
 * to `'exact'`. This means that conditions **must** provide enough constraints
 * for constructions of the partition-key.
 *
 * This is provided as a special function, because `Entity.scan` shouldn't be
 * used for on-the-fly queries, when `matchPartition: 'none'`. As `Entity.scan`
 * will do a full table scan, which is only suitable in background workers.
 *
 * If you use `Entity.query` you don't run the risk of executing a full
 * table scan. But depending on the size of your partitions it may still be a
 * lengthy operation. Always query with care.
 */
Entity.query = function(conditions, options) {
  // Overwrite the matchPartition option
  options = _.defaults({
    matchPartition:   'exact',
  }, options || {});

  return Entity.scan.call(this, conditions, options);
};


/** Utility method for node making util.inspect print properties */
Entity.prototype.inspect = function(depth) {
  return util.inspect(this._properties, {depth: depth});
};

// TODO: Method upgrade all entities to new version in a background-process
//       This is useful for when something relies on filtering properties
//       and we change a property name. We should have some utilities for doing
//       this...

// Export Entity
module.exports = Entity;

