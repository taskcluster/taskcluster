var assert          = require('assert');
var util            = require('util');
var slugid          = require('slugid');
var _               = require('lodash');
var Promise         = require('promise');
var debug           = require('debug')('base:entity');
var azureTable      = require('azure-table-node');

// Data types registered
var _dataTypes = {};

// Normalize a mapping, ie. convert from list to object and validate
var normalizeMapping = function(mapping) {
  var keys        = [];
  var properties  = [];
  var result      = {};
  mapping.forEach(function(entry) {
    // Check that PartitionKey and RowKey always are strings
    assert(entry.key != 'PartitionKey' || entry.type == 'string',
                                      "PartitionKey must be a string");
    assert(entry.key != 'RowKey' || entry.type == 'string',
                                      "RowKey must be a string");
    // Ensure that a key is defined
    assert(entry.key !== undefined,   "Entry key must be defined");
    // Check that entry has a type and that is defined
    assert(entry.type !== undefined,  "Entry type must be defined");
    assert(_dataTypes[entry.type] !== undefined,
                                      "Entry has invalid type: " + entry.type);
    // Use key as property name if none is specified
    if (entry.property === undefined) {
      entry.property = entry.key;
    }
    // Add to keys and properties and check if uniqueness
    assert(keys.indexOf(entry.key) === -1,
                                      "Duplicate key in mapping: " + entry.key);
    assert(properties.indexOf(entry.property) === -1,
                                      "Duplicate property in mapping: " +
                                      entry.property);
    keys.push(entry.key);
    properties.push(entry.property);
    // Add serialize and deserialize to entry
    entry.serialize   = _dataTypes[entry.type].serialize;
    entry.deserialize = _dataTypes[entry.type].deserialize;
    // Add entry to result
    result[entry.key] = entry;
  });
  return result;
}


/** Base class of all entity */
var Entity = function(entity) {
  // Set __etag
  this.__etag = entity.__etag || null;

  // Create shadow object
  this.__shadow = {};

  // Set properties on shadow object
  var that = this;
  _.forIn(this.__mapping, function(entry, key) {
    that.__shadow[entry.property] = entry.deserialize(entity[key]);
  });
};

/**
 * Register a custom data type that can be declared in a mapping, where `type`
 * is the name of the data type, use as the `type` property.
 *
 * options:
 * {
 *   serialize:      function(data)  {return JSON.stringify(data); }
 *   deserialize:    function(raw)   {return JSON.parse(raw); }
 * }
 */
Entity.registerDataType = function(type, options) {
  assert(typeof(type) === 'string',       "A data type must have a name");
  assert(_dataTypes[type] === undefined,  "Data type already registered");
  assert(options.serialize instanceof Function,
                                          "Missing options.serialize");
  assert(options.deserialize instanceof Function,
                                          "Missing options.deserialize");
  _dataTypes[type] = options;
};

// Register `string` as a type
Entity.registerDataType('string', {
  serialize:    function(d) {
    assert(typeof(d) === 'string', "Type string must be a string");
    return d;
  },
  deserialize:  function(r) {
    assert(typeof(r) === 'string', "Type string must be a string");
    return r;
  }
});

// Register `number` as a type
Entity.registerDataType('number', {
  serialize:    function(d) {
    assert(typeof(d) === 'number', "Type number must be a number");
    return d;
  },
  deserialize:  function(r) {
    assert(typeof(r) === 'number', "Type number must be a number");
    return r;
  }
});

// Register `json` as a type
Entity.registerDataType('json', {
  serialize:    function(d) { return JSON.stringify(d); },
  deserialize:  function(r) {
    assert(typeof(r) === 'string', "JSON input must be a string");
    return JSON.parse(r);
  }
});

// Register `date` as a type
Entity.registerDataType('date', {
  serialize:    function(d) {
    assert(d instanceof Date, "Type date must be an instance of Date");
    return d;
  },
  deserialize:  function(r) {
    assert(r instanceof Date, "Type date must be an instance of Date");
    return r;
  }
});

// Register `slugid` as a type
Entity.registerDataType('slugid', {
  serialize:    function(d) {
    assert(d,               "Slugs must be a string");
    assert(d.length == 22,  "Slugs should always be 22 chars long");
    return slugid.decode(d);
  },
  deserialize:  function(r) {
    assert(typeof(r) == 'string', "Slugids should be returned from " +
                                  "azure as strings");
    return slugid.encode(r);
  }
});

/**
 * Configure a subclass of `this` (`Entity` or subclass thereof) with following
 * options:
 * {
 *   credentials: {
 *     accountName:    "...",              // Azure account name
 *     accountKey:     "...",              // Azure account key
 *     accountUrl:     "https://..."       // Account URL, please use HTTPS
 *   },
 *   tableName:        "AzureTableName",   // Azure table name
 *   mapping:          [...]               // Property mapping.
 * }
 *
 * When creating a subclass of `Entity` using this method, you must provide all
 * options before you try to initialize instances of the subclass. You may
 * create a subclass hierarchy and provide options one at the time. More details
 * below.
 *
 * When creating a subclass using `configure` all the class properties and
 * class members (read static functions like `Entity.configure`) will also be
 * inherited. So it is possible to do as follows:
 *
 * ```js
 * // Create an abstract user
 * var AbstractUser = Entity.configure({
 *   mapping: [
 *     {key: 'PartitionKey', property: 'userId', type: 'string'},
 *     ...
 *   ]
 * });
 *
 * AbstractUser.load = function(userId) {
 *   // Hard code in the RowKey, because we only index by `userId`
 *   return Entity.load.call(this, userId, 'user-definition');
 * };

 * // Create one UserTyp
 * var UserType1 = AbstractUser.configure({
 *   credentials:    {...},
 *   tableName:      "UserTable1"
 * });

 * // Create another UserType with a separate table
 * var UserType2 = AbstractUser.configure({
 *   credentials:    {...},
 *   tableName:      "UserTable2"
 * });
 * ```
 *
 * Typically, `Entity.configure` will be used in a module to create a subclass
 * of Entity with neat auxiliary static class methods and useful members, then
 * this abstract type will again be subclassed and configured with connection
 * credentials and table name. This allows for multiple tables with the same
 * abstract definition.
 */
Entity.configure = function(options) {
  // Identify the parent class, that is always `this` so we can use it on
  // subclasses
  var Parent = this;

  // Create a subclass of Parent
  var subClass = function(entity) {
    // Always pass down the entity we're initializing from
    Parent.call(this, entity);
  };
  util.inherits(subClass, Parent);

  // Inherit class methods too (static members in C++)
  _.assign(subClass, Parent);


  // If credentials are provided validate them and add an azure table client
  if (options.credentials) {
    assert(options.credentials,             "Azure credentials must be given");
    assert(options.credentials.accountUrl,  "Missing accountUrl");
    assert(/^https:\/\//.test(options.credentials.accountUrl),
                                            "Don't use non-HTTPS accountUrl");
    assert(options.credentials.accountName, "Missing accountName");
    assert(options.credentials.accountKey ||
           options.credentials.sas,         "Missing accountKey or sas");
    subClass.prototype._azClient = azureTable.createClient(options.credentials);
  }

  // If tableName is provide validate and add it
  if (options.tableName) {
    assert(typeof(options.tableName) === 'string', "tableName isn't a string");
    subClass.prototype._azTableName = options.tableName;
  }

  // If mapping is given assign it
  if (options.mapping) {
    subClass.prototype.__mapping = normalizeMapping(options.mapping);
    // Define access properties
    _.forIn(subClass.prototype.__mapping, function(entry) {
      if (entry.hidden) {
        return;
      }
      // Define property for accessing underlying shadow object
      Object.defineProperty(subClass.prototype, entry.property, {
        enumerable: true,
        get:        function() {return this.__shadow[entry.property]; }
      });
    });
  }

  // Return subClass
  return subClass;
};


/**
 * Create an entity on azure table with property and mapping.
 * Returns a promise for an instance of `this` (typically an Entity subclass)
 */
Entity.create = function(properties) {
  var Class = this;
  assert(properties,  "Properties is required");
  assert(Class,       "Entity.create must be bound to an Entity subclass");
  assert(Class.prototype._azClient,     "Azure credentials not configured");
  assert(Class.prototype._azTableName,  "Azure tableName not configured");
  assert(Class.prototype.__mapping,     "Property mapping not configured");

  // Return a promise that we inserted the entity
  return new Promise(function(accept, reject) {
    // Construct entity from properties
    var entity = {};
    _.forIn(Class.prototype.__mapping, function(entry, key) {
      entity[key] = entry.serialize(properties[entry.property]);
    });

    // Insert entity
    Class.prototype._azClient.insertEntity(Class.prototype._azTableName,
                                           entity, function(err, etag) {
      // Reject if we have an error
      if (err) {
        debug("Failed to insert entity: %j", entity);
        return reject(err);
      }

      // Add etag to entity
      entity.__etag = etag;

      // Return entity that we inserted
      debug("Inserted entity: %j", entity);
      accept(entity);
    });
  }).then(function(entity) {
    // Construct Entity subclass using Class
    return new Class(entity);
  });
};

/**
 * Load Entity subclass from azure given PartitionKey and RowKey,
 * This method return a promise for the subclass instance.
 */
Entity.load = function(partitionKey, rowKey) {
  var Class = this;
  assert(partitionKey,    "PartitionKey is required");
  assert(partitionKey,    "RowKey is required");
  assert(Class,           "Entity.create must be bound to an Entity subclass");
  var client    = Class.prototype._azClient;
  var tableName = Class.prototype._azTableName;
  var mapping   = Class.prototype.__mapping;
  assert(client,    "Azure credentials not configured");
  assert(tableName, "Azure tableName not configured");
  assert(mapping,   "Property mapping not configured");

  // Serialize partitionKey and rowKey
  partitionKey  = mapping.PartitionKey.serialize(partitionKey);
  rowKey        = mapping.RowKey.serialize(rowKey);
  return new Promise(function(accept, reject) {
    client.getEntity(tableName, partitionKey, rowKey, function(err, entity) {
      // Reject if there is an error
      if (err) {
        return reject(err);
      }

      // Accept constructed entity, we'll wrap below, to catch exceptions
      accept(entity);
    });
  }).then(function(entity) {
    // Construct and return Entity subclass using constructor
    return new Class(entity);
  });
};

/** Load all entities with a given partitionKey */
Entity.queryPartitionKey = function(partitionKey) {
  var Class = this;
  assert(Class,     "Entity.create must be bound to an Entity subclass");
  var client    = Class.prototype._azClient;
  var tableName = Class.prototype._azTableName;
  var mapping   = Class.prototype.__mapping;
  assert(client,    "Azure credentials not configured");
  assert(tableName, "Azure tableName not configured");
  assert(mapping,   "Property mapping not configured");

  // Serialize RowKey
  partitionKey = mapping.PartitionKey.serialize(partitionKey);

  return new Promise(function(accept, reject) {
    var entities = [];
    var fetchNext = function(continuationTokens) {
      client.queryEntities(tableName, {
        query:        azureTable.Query.create('PartitionKey', '==', partitionKey),
        forceEtags:   true,
        continuation: continuationTokens
      }, function(err, data, continuationTokens) {
        // Reject if we hit an error
        if (err) {
          return reject(err);
        }
        // Create wrapper for each entity fetched
        entities.push.apply(entities, data.map(function(entity) {
          return new Class(entity);
        }));

        // If there are no continuation tokens then we accept data fetched
        if (!continuationTokens) {
          return accept(entities);
        }
        // Fetch next set based on continuation tokens
        fetchNext(continuationTokens);
      });
    }
    fetchNext(undefined);
  });
};


/** Load all entities with a given rowKey */
Entity.queryRowKey = function(rowKey) {
  var Class = this;
  assert(Class,     "Entity.create must be bound to an Entity subclass");
  var client    = Class.prototype._azClient;
  var tableName = Class.prototype._azTableName;
  var mapping   = Class.prototype.__mapping;
  assert(client,    "Azure credentials not configured");
  assert(tableName, "Azure tableName not configured");
  assert(mapping,   "Property mapping not configured");

  // Serialize RowKey
  rowKey = mapping.RowKey.serialize(rowKey);

  return new Promise(function(accept, reject) {
    var entities = [];
    var fetchNext = function(continuationTokens) {
      client.queryEntities(tableName, {
        query:        azureTable.Query.create('RowKey', '==', rowKey),
        forceEtags:   true,
        continuation: continuationTokens
      }, function(err, data, continuationTokens) {
        // Reject if we hit an error
        if (err) {
          return reject(err);
        }
        // Create wrapper for each entity fetched
        entities.push.apply(entities, data.map(function(entity) {
          return new Class(entity);
        }));

        // If there are no continuation tokens then we accept data fetched
        if (!continuationTokens) {
          return accept(entities);
        }
        // Fetch next set based on continuation tokens
        fetchNext(continuationTokens);
      });
    }
    fetchNext(undefined);
  });
};

/** Remove entity without loading it */
Entity.remove = function(partitionKey, rowKey) {
  var Class = this;
  assert(partitionKey,    "PartitionKey is required");
  assert(partitionKey,    "RowKey is required");
  assert(Class,           "Entity.create must be bound to an Entity subclass");
  var client    = Class.prototype._azClient;
  var tableName = Class.prototype._azTableName;
  var mapping   = Class.prototype.__mapping;
  assert(client,    "Azure credentials not configured");
  assert(tableName, "Azure tableName not configured");
  assert(mapping,   "Property mapping not configured");

  // Serialize partitionKey and rowKey
  partitionKey  = mapping.PartitionKey.serialize(partitionKey);
  rowKey        = mapping.RowKey.serialize(rowKey);
  return new Promise(function(accept, reject) {
    client.deleteEntity(tableName, {
      PartitionKey:       partitionKey,
      RowKey:             rowKey,
      __etag:             undefined
    }, {
      force:              true
    }, function(err) {
      // Reject if there is an error
      if (err) {
        debug("Failed to delete entity with error: %s, as JSON: %j",
              err, err, err.stack);
        return reject(err);
      }
      accept();
    });
  });
};

/** Remove entity if not modified, unless ignoreChanges == true */
Entity.prototype.remove = function(ignoreChanges) {
  var that = this;
  return new Promise(function(accept, reject) {
    // Find PartitionKey and RowKey from shadow property
    var pkEntry = that.__mapping.PartitionKey;
    var rkEntry = that.__mapping.RowKey;
    var partitionKey  = pkEntry.serialize(that.__shadow[pkEntry.property]);
    var rowKey        = rkEntry.serialize(that.__shadow[rkEntry.property]);
    that._azClient.deleteEntity(that._azTableName, {
      PartitionKey:   partitionKey,
      RowKey:         rowKey,
      __etag:         ignoreChanges === true ? undefined : that.__etag
    }, {
      force:          ignoreChanges === true
    }, function(err, data) {
      if (err) {
        debug("Failed to delete entity with error: %s, as JSON: %j",
              err, err, err.stack);
        return reject(err);
      }
      accept();
    });
  });
};

// Max number of modify attempts to make when experiencing collisions with
// optimistic concurrency.
var MAX_MODIFY_RETRIES      = 5;

/**
 * Modify an Entity subclass, the `modifier` is a function that is called with
 * a clone of the entity as `this`, it should apply modifications to `this`.
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
 * **Note** modifier may return a promise.
 */
Entity.prototype.modify = function(modifier) {
  var that        = this;
  var mapping     = this.__mapping;
  var pkEntry     = mapping.PartitionKey;
  var rkEntry     = mapping.RowKey;
  var attempts    = 0;
  // Create shadow object, so we can track changes
  var shadow      = _.cloneDeep(this.__shadow);
  var etag        = this.__etag;
  // Create clone properties of shadow for modification
  var properties  = _.cloneDeep(shadow);

  // Attempt to update the entity
  var attemptUpdate = function() {
    return new Promise(function(accept, reject) {
      // Construct object with changes
      var entityChanges = {};

      // Add changes to entityChanges
      var changed = false;
      _.forIn(mapping, function(entry, key) {
        var newValue = entry.serialize(properties[entry.property])
        var oldValue = entry.serialize(shadow[entry.property]);
        if (newValue != oldValue) {
          entityChanges[key] = newValue;
          changed = true;
        }
      });
      // Check that neither ParitionKey or RowKey is changed
      assert(entityChanges.PartitionKey === undefined,
             "Can't modify PartitionKey:" + pkEntry.property);
      assert(entityChanges.RowKey === undefined,
             "Can't modify RowKey:" + rkEntry.property);

      // Add previous etag for consistency
      entityChanges.__etag = etag;

      // If no property was changed, return immediately
      if (!changed) {
        debug("Return modify trivially as no changes was applied by modifier");
        return accept();
      }

      // Add PartitionKey and RowKey so we can send changes
      entityChanges.PartitionKey = pkEntry.serialize(shadow[pkEntry.property]);
      entityChanges.RowKey       = rkEntry.serialize(shadow[rkEntry.property]);

      // Attempt to update the entity
      that._azClient.mergeEntity(that._azTableName, entityChanges,
                                 function(err, etag_) {
        if (err) {
          return reject(err);
        }
        etag = etag_;
        accept();
      });
    });
  };

  // Update shadow object and apply modifications again
  var updateShadow = function() {
    return new Promise(function(accept, reject) {
      // Find PartitionKey and RowKey from shadow property
      var partitionKey  = pkEntry.serialize(shadow[pkEntry.property]);
      var rowKey        = rkEntry.serialize(shadow[rkEntry.property]);

      // Fetch entity from azure table
      that._azClient.getEntity(
        that._azTableName,
        partitionKey, rowKey,
        function(err, entity) {
        // Reject if there is an error
        if (err) {
          return reject(err);
        }

        debug("Reloaded entity for modifier");

        accept(entity);
      });
    }).then(function(entity) {
      // Update shadow object to new values
      _.forIn(mapping, function(entry, key) {
        shadow[entry.property] = entry.deserialize(entity[key]);
      });

      // Update etag
      etag = entity.__etag;

      // Reset properties to a clean clone of shadow
      properties  = _.cloneDeep(shadow);
    });
  };

  // Attempt to update using current state and if that fails update the shadow
  // and try again...
  var retryLoop = function() {
    // Apply modifier to properties
    var modified = Promise.from(modifier.call(properties));

    // When modified attempt to update
    return modified.then(function() {
      var updated = attemptUpdate();

      // If update fails we retry it gain
      return updated.catch(function(err) {
        // Rethrow error, if this didn't happen because of an etag mismatch
        if (err.code != 'UpdateConditionNotSatisfied') {
          debug(
            "Update of entity failed unexpectedly, %s, as JSON: %j",
            err, err, err.stack
          );
          throw err;
        }

        // Increment number of attempts
        attempts += 1;
        if (attempts >= MAX_MODIFY_RETRIES) {
          debug("WARNING: Attempted to modify more than MAX_MODIFY_RETRIES");
          throw err;
        }

        // Retry, by updating shadow from azure table
        return updateShadow().then(function() {
          return retryLoop();
        });
      });
    });
  };

  // Start the retry loop
  return retryLoop().then(function() {
    // if successful we better update this object
    that.__shadow = properties;
    that.__etag   = etag;

    // Return object that was modified
    return that;
  });
};


/** Create the underlying azure table */
Entity.createTable = function(errorIfExists) {
  var Class = this;
  var client  = Class.prototype._azClient;
  var table   = Class.prototype._azTableName;
  assert(client,  "Azure credentials not configured");
  assert(table,   "Azure tableName not configured");

  return new Promise(function(accept, reject) {
    client.createTable(table, {
      ignoreIfExists:     (errorIfExists ? false : true)
    }, function(err, data) {
      if (err) {
        debug("Failed to create table '%s' with error: %s, as JSON: %j",
              table, err, err);
        return reject(err);
      }
      accept();
    });
  });
};

/** Delete azure table, return promise of success */
Entity.deleteTable = function(ignoreErrors) {
  var Class = this;
  var client  = Class.prototype._azClient;
  var table   = Class.prototype._azTableName;
  assert(client,  "Azure credentials not configured");
  assert(table,   "Azure tableName not configured");

  // Delete table
  return new Promise(function(accept, reject) {
    client.deleteTable(table, function(err) {
      if (err && !ignoreErrors) {
        debug("Failed to delete table '%s' with error: %s, as JSON: %j",
              table, err, err);
        return reject(err);
      }
      accept();
    });
  });
};


// Export Entity
module.exports = Entity;
