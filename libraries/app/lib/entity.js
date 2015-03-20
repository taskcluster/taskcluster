"use strict";

var assert          = require('assert');
var util            = require('util');
var slugid          = require('slugid');
var _               = require('lodash');
var Promise         = require('promise');
var debug           = require('debug')('base:entity');
var azureTable      = require('azure-table-node');
var taskcluster     = require('taskcluster-client');
var https           = require('https');

// ** Coding Style **
// To ease reading of this component we recommend the following code guidelines:
//
// Summary:
//    - Use __ prefix for private variables in `Entity`
//    - Variables named `entity` are semi-raw `azure-table-node` types
//    - Variables named `item` are instances of `Entity`
//    - Variables named `properties` are deserialized `entity` objects
//
// Long Version:
//
//
//    * Variables named `entity` are "raw" entities, well raw in the sense that
//      they interface the transport layer provided by `azure-table-node`.
//
//    * Variables named `item` refers instances of `Entity` or instances of
//      subclasses of `Entity`. This is slightly confusing as people using the
//      `Entity` class (of subclasses thereof) are more likely refer to generic
//      instances of their subclasses as `entity` and not `item`.
//      We draw the distinction here because `azure-table-node` is closer to
//      Azure Table Storage which uses the terminology entities. Also subclasses
//      of `Entity` usually has another name, like `Artifact`, so non-generic
//      instances are easily referred to using a variant of that name,
//      like `artifact` as an instance of `Artifact`.
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

/** Timeout for azure table requests */
var AZURE_TABLE_TIMEOUT     = 30 * 1000;

/** Azure table agent used for all instances of the table client */
var globalAzureTableAgent = new https.Agent({
  keepAlive:      true,
  maxSockets:     1000,
  maxFreeSockets: 500
});

/**
 * Max number of modify attempts to make when experiencing collisions with
 * optimistic concurrency.
 */
var MAX_MODIFY_ATTEMPTS     = 10;

/**
 * Base class of all entity
 *
 * This constructor will wrap a raw azure-table-node entity.
 */
var Entity = function(entity) {
  assert(entity.PartitionKey, "entity is missing 'PartitionKey'");
  assert(entity.RowKey,       "entity is missing 'RowKey'");
  assert(entity.__etag,       "entity is missing '__etag'");
  assert(entity.Version,      "entity is missing 'Version'");

  // Set __etag
  this.__etag = entity.__etag || null;

  // Deserialize a shadow object from the entity
  this.__properties = this.__deserialize(entity);
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
Entity.prototype.__mapping      = undefined;  // Schema mapping to types
Entity.prototype.__version      = 0;          // Schema version
Entity.prototype.__partitionKey = undefined;  // PartitionKey builder
Entity.prototype.__rowKey       = undefined;  // RowKey builder

// Define method that returns a promise for a context with properties:
// - client
// - expiry
// - table
Entity.prototype.__connect      = function() {
  return new Promise(function() {
    throw new Error("Entity not setup, see Entity.setup()");
  });
};
Entity.prototype.__aux          = undefined;  // Auxiliary methods for client
Entity.prototype.__table        = undefined;  // Azure table name

// Define properties set in constructor
Entity.prototype.__properties   = undefined;  // Deserialized shadow object
Entity.prototype.__etag         = undefined;  // Etag of remote entity

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
var wrapEntityClass = function (Class) {
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
    subClass.prototype.__connect === Entity.prototype.__connect &&
    subClass.prototype.__aux === undefined &&
    subClass.prototype.__table === undefined,
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
 *   authBaseUrl:       "...",              // baseUrl for auth (optional)
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
  options = _.defaults({}, options, {
    context:      {}
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
    subClass.prototype.__connect === Entity.prototype.__connect &&
    subClass.prototype.__aux === undefined &&
    subClass.prototype.__table === undefined,
    "This `Entity` subclass is already setup!"
  );

  // Define access properties, we do this here, as doing it in Entity.configure
  // means that it could be called more than once. When subclassing with new
  // versions, we don't really want that.
  _.forIn(subClass.prototype.__mapping, function(type, property) {
    // Define property for accessing underlying shadow object
    Object.defineProperty(subClass.prototype, property, {
      enumerable: true,
      get:        function() {return this.__properties[property];}
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

  // Default client, notice that it's already expired
  var client          = null;
  var promisedClient  = null;
  var expiry          = -1;

  // Check if we're setting up to fetch credentials for auth.taskcluster.net
  if (options.account) {
    assert(typeof(options.account) === 'string',
           "Expected options.account to be a string, or undefined");
    // Create method that will connect (if needed) and return client
    subClass.prototype.__connect = function() {
      // Return client, if we have a current one
      if (expiry > new Date().getTime() + 3 * 60 * 1000) {
        return Promise.resolve(client);
      }

      // If we are in the process of fetching a client, we just return the
      // promise for this
      if (promisedClient) {
        return promisedClient;
      }

      // Fetch SAS from auth.taskcluster.net
      var auth = new taskcluster.Auth({
        credentials:    options.credentials,
        baseUrl:        options.authBaseUrl
      });
      // Create a promise for a client
      promisedClient = auth.azureTableSAS(
        options.account,
        options.table
      ).then(function(result) {
        // Set expiry and create client using result
        expiry  = new Date(result.expiry).getTime();
        client  = azureTable.createClient({
          accountName:  options.account,
          sas:          result.sas,
          accountUrl:   [
            "https://",
            options.account,
            ".table.core.windows.net/"
          ].join(''),
          timeout:      AZURE_TABLE_TIMEOUT,
          agent:        globalAzureTableAgent,
          metadata:     'minimal'
        });
        // We now have a client, so forget about the promise for one
        promisedClient = null;
        return client;
      });

      return promisedClient;
    };
  } else {
    // Create client using credentials already present
    assert(options.credentials.accountName, "Missing accountName");
    assert(options.credentials.accountKey ||
           options.credentials.sas,         "Missing accountKey or sas");
    // Add accountUrl, if not already present, there is really no reason to
    // not just compute... That's what the Microsoft libraries does anyways
    var credentials = _.defaults({
      timeout:      AZURE_TABLE_TIMEOUT,
      agent:        globalAzureTableAgent,
      metadata:     'minimal'
    }, options.credentials, {
      accountUrl: [
        "https://",
        options.credentials.accountName,
        ".table.core.windows.net/"
      ].join('')
    });
    assert(/^https:\/\//.test(credentials.accountUrl),
           "Use HTTPS for accountUrl");
    expiry  = Number.MAX_VALUE;
    client  = azureTable.createClient(credentials);

    // Create method that will connect (if needed) and return client
    subClass.prototype.__connect = function() {
      // Set promise for the client
      return Promise.resolve(client);
    };
  }

  // Create property for auxiliary methods
  var aux = subClass.prototype.__aux = {};

  // Add methods to aux wrapping the raw client, we do this for 3 reasons:
  //  1. Return promises (instead of taking callbacks),
  //  2. Bind methods to table name, and
  //  3. Refresh client when SAS expires
  [
    'createTable',
    'deleteTable',
    'deleteEntity',
    'insertEntity',
    'insertOrReplaceEntity',
    'updateEntity',
    'mergeEntity',
    'getEntity'
  ].forEach(function(method) {
    aux[method] = function() {
      var args = Array.prototype.slice.call(arguments);
      return subClass.prototype.__connect().then(function(client) {
        return new Promise(function(accept, reject) {
          args.unshift(subClass.prototype.__table);
          args.push(function(err, res) {
            if (err) {
              return reject(err);
            }
            accept(res);
          });
          client[method].apply(client, args);
        });
      });
    };
  });

  // Helper method for queryEntities, which is a special-case as it carries
  // a continuation token as third parameter in the callback.
  aux.queryEntities = function(options) {
    return subClass.prototype.__connect().then(function(client) {
      var table  = subClass.prototype.__table;
      return new Promise(function(accept, reject) {
        client.queryEntities(table, options, function(err, data, token) {
          if (err) {
            return reject(err);
          }
          return accept({
            entries:        data,
            continuation:   token
          });
        });
      });
    });
  };

  // Return subClass
  return subClass;
};

/**
 * Create the underlying Azure Storage Table, errors if it exists
 *
 * Remark, this doesn't work, if authenticated with SAS.
 */
Entity.createTable = function() {
  var Class       = this;
  var ClassProps  = Class.prototype;

  return ClassProps.__aux.createTable({
    ignoreIfExists:     false
  }).catch(rethrowDebug(
    "createTable: Failed to create table '%s' with err: %j",
    ClassProps.__table
  ));
};

/** Ensure existence of the underlying Azure Storage Table
 *
 * Remark, this doesn't work, if authenticated with SAS.
 */
Entity.ensureTable = function() {
  var Class       = this;
  var ClassProps  = Class.prototype;

  return ClassProps.__aux.createTable({
    ignoreIfExists:     true
  }).catch(rethrowDebug(
    "ensureTable: Failed to create table '%s' with err: %j",
    ClassProps.__table
  ));
};

/** Delete the underlying Azure Storage Table
 *
 * Remark, this doesn't work, if authenticated with SAS.
 */
Entity.removeTable = function(ignoreErrors) {
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
  assert(properties,              "Properties is required");

  // Construct entity with built-in properties
  var entity = {
    PartitionKey:     ClassProps.__partitionKey.exact(properties),
    RowKey:           ClassProps.__rowKey.exact(properties),
    Version:          ClassProps.__version
  };

  // Add custom properties to entity
  _.forIn(ClassProps.__mapping, function(type, property) {
    type.serialize(entity, properties[property]);
  });

  // Use insertOrReplaceEntity if we should overwrite on existence
  var createMethod = ClassProps.__aux.insertEntity;
  if (overwriteIfExists) {
    createMethod = ClassProps.__aux.insertOrReplaceEntity;
  }

  // Create entity
  return createMethod(entity)
  .catch(rethrowDebug("Failed to insert entity err: %j"))
  .then(function(etag) {
    entity.__etag = etag;     // Add etag
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

  return ClassProps.__aux.deleteEntity({
    PartitionKey:     ClassProps.__partitionKey.exact(properties),
    RowKey:           ClassProps.__rowKey.exact(properties),
    __etag:           undefined
  }, {
    force:            true
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
  return this.__aux.deleteEntity({
    PartitionKey:     this.__partitionKey.exact(this.__properties),
    RowKey:           this.__rowKey.exact(this.__properties),
    __etag:           ignoreChanges ? undefined : this.__etag
  }, {
    force:            ignoreChanges ? true : false
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
  var that = this;
  var etag = this.__etag;

  // Serialize partitionKey and rowKey
  var partitionKey  = this.__partitionKey.exact(this.__properties);
  var rowKey        = this.__rowKey.exact(this.__properties);

  return this.__aux.getEntity(
    partitionKey,
    rowKey
  ).then(function(entity) {
    // Deserialize a shadow object from the entity
    that.__properties = that.__deserialize(entity);

    // Set __etag
    that.__etag = entity.__etag;

    // Check if any properties was modified
    return that.__etag !== etag;
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
  var that = this;

  // Serialize partitionKey and rowKey
  var partitionKey  = this.__partitionKey.exact(this.__properties);
  var rowKey        = this.__rowKey.exact(this.__properties);

  // Create a clone of this.__properties, that can be used to compare properties
  // and restore state, if operations fail
  var properties    = {};
  var etag          = this.__etag;
  _.forIn(this.__mapping, function(type, property) {
    properties[property] = type.clone(this.__properties[property]);
  }, this);

  // Attempt to modify this object
  var attemptsLeft = MAX_MODIFY_ATTEMPTS;
  var attemptModify = function() {
    var modified = Promise.resolve(modifier.call(
      that.__properties,
      that.__properties
    ));
    return modified.then(function() {
      var isChanged     = false;
      var entityChanges = {};

      // Check if `that.__properties` have been changed and serialize changes to
      // `entityChanges` while flagging changes in `isChanged`
      _.forIn(that.__mapping, function(type, property) {
        var value = that.__properties[property];
        if (!type.equal(properties[property], value)) {
          type.serialize(entityChanges, value);
          isChanged = true;
        }
      });

      // Check for changes
      if (!isChanged) {
        debug("Return modify trivially, as changed was applied by modifier");
        return that;
      }

      // Check for key modifications
      assert(partitionKey === that.__partitionKey.exact(that.__properties),
             "You can't modify elements of the partitionKey");
      assert(rowKey === that.__rowKey.exact(that.__properties),
             "You can't modify elements of the rowKey");

      // Set rowKey and partition key
      entityChanges.PartitionKey  = partitionKey;
      entityChanges.RowKey        = rowKey;

      // Set etag
      entityChanges.__etag = that.__etag;

      return that.__aux.mergeEntity(entityChanges).then(function(etag) {
        that.__etag = etag;
        return that;
      });
    }).catch(function(err) {
      // Restore internal state
      that.__etag = etag;
      that.__properties = properties;

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
      return that.__aux.getEntity(partitionKey, rowKey).then(function(entity) {
        // Deserialize properties and set etag
        that.__properties = that.__deserialize(entity);
        that.__etag = entity.__etag;

        // Attempt to modify again
        return attemptModify();
      });
    });
  };

  return attemptModify();
};


/** Encode continuation token as single string using tilde as separator */
var encodeContinuationToken = function(token) {
  if (token === undefined || token === null) {
    return token;
  }
  assert(token instanceof Array, "ContinuationToken should have been an array");
  assert(token.length === 2,     "ContinuationToken should have length 2");
  // Escape with encodeURIComponent + escape tilde (~) so we can use it as
  // separator
  return [
    encodeURIComponent(token[0]).replace(/~/g, '%7e'),
    encodeURIComponent(token[1]).replace(/~/g, '%7e')
  ].join('~');
};

/** Decode continuation token, inverse of encodeContinuationToken */
var decodeContinuationToken = function(token) {
  if (token === undefined || token === null) {
    return token;
  }
  assert(typeof(token) === 'string', "Continuation token must be a string if " +
                                     "not undefined");
  // Split at tilde (~)
  token = token.split('~');
  assert(token.length === 2, "Expected an encoded continuation token with " +
                             "a single tilde as separator");
  return [
    decodeURIComponent(token[0]),
    decodeURIComponent(token[1])
  ];
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
    limit:            1000,
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
  assert(typeof(options.limit) === 'number', "options.limit must be a number");

  // Find all equality operators and find PartitionKey
  var properties = _.mapValues(conditions, function(op) {
    // If no operator was used then it is an equality condition
    if (!(op instanceof Entity.op)) {
      return op;
    }
    // If it's an equality operator, then the value is the operand
    if (op.operator === '==') {
      return op.operand;
    }
    // Other wise, no exact value is specified
    return undefined;
  });

  // Declare partitionKey, rowKey and covered as list of keys covered by either
  // partitionKey or rowKey
  var partitionKey  = undefined
  var rowKey        = undefined;
  var covered       = [];

  // Construct keys exact, if that is how they are required to be matched
  if (options.matchPartition === 'exact') {
    partitionKey    = ClassProps.__partitionKey.exact(properties);
    covered         = _.union(covered, ClassProps.__partitionKey.covers);
  }
  if (options.matchRow === 'exact') {
    rowKey          = ClassProps.__rowKey.exact(properties);
    covered         = _.union(covered, ClassProps.__partitionKey.covers);
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

  // Create a query and a query builder function to abstract away joining
  // with 'and'
  var query = undefined;
  var queryBuilder = function(property, operator, value) {
    if (!query) {
      query = azureTable.Query.create(property, operator, value);
    } else {
      query = query.and(property, operator, value);
    }
  };

  // If we have partitionKey and rowKey we should add them to the query
  if (partitionKey !== undefined) {
    queryBuilder('PartitionKey', '==', partitionKey);
  }
  if (rowKey !== undefined) {
    queryBuilder('RowKey', '==', rowKey);
  }

  // Construct query from conditions using operators
  _.forIn(conditions, function(op, property) {
    // If the property is covered by the partitionKey or rowKey, we don't want
    // to apply a filter to it
    if (_.contains(covered, property)) {
      return undefined;
    }

    // Find and check that we have a type
    var type = ClassProps.__mapping[property];
    if (!type) {
      throw new Error("Property: '" + property +
                      "' used in query is not defined!");
    }

    // Ensure that we have an Op instance, we just assume anything specified
    // without an operator is equality
    if (!(op instanceof Entity.op)) {
      op = Entity.op.equal(op);
    }

    // Let the operator construct the filter
    return op.filter(type, property, queryBuilder);
  });

  // Fetch results with operational continuation token
  var fetchResults = function(continuation) {
    return ClassProps.__aux.queryEntities({
      query:        query,
      limitTo:      options.limit,
      forceEtags:   true,
      continuation: continuation
    }).then(function(data) {
      return {
        entries:      data.entries.map(function(entity) {
                        return new Class(entity);
                      }),
        continuation: encodeContinuationToken(data.continuation)
      };
    });
  };

  // Fetch results
  var results = fetchResults(decodeContinuationToken(options.continuation));

  // If we have a handler, then we have to handle the results
  if (options.handler) {
    var handleResults = function(results) {
      return results.then(function(data) {
        return Promise.all(data.entries.map(function(item) {
          return options.handler(item);
        })).then(function() {
          if (data.continuation) {
            var continuation = decodeContinuationToken(data.continuation);
            return handleResults(fetchResults(continuation));
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
  return util.inspect(this.__properties, {depth: depth});
};

// TODO: Method upgrade all entities to new version in a background-process
//       This is useful for when something relies on filtering properties
//       and we change a property name. We should have some utilities for doing
//       this...

// Export Entity
module.exports = Entity;

