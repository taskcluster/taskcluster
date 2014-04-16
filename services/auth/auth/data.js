var azureTable      = require('azure-table-node');
var nconf           = require('nconf');
var _               = require('lodash');
var assert          = require('assert');
var util            = require('util');
var Promise         = require('promise');
var debug           = require('debug')('scheduler:data');
var slugid          = require('slugid');

var MAX_MODIFY_RETRIES      = 5;

// Create default azureTable client for convenience
azureTable.setDefaultClient(nconf.get('azureTableCredentials'));
var client = azureTable.getDefaultClient();

/** Date types supported by serialize/deserialize */
var dataTypes = ['string', 'number', 'json', 'date', 'slugid'];

/** Normalize and validate a entity mapping entry */
var normalizeEntityMappingEntry = function(entry) {
  assert(entry.key != 'PartitionKey' || entry.type == 'string',
         "PartitionKey must be a string, azure table always stores as string");
  assert(entry.key != 'RowKey' || entry.type == 'string',
         "RowKey must be a string, azure table always stores as string");
  assert(entry.key !== undefined, "Entry key must be defined");
  assert(entry.type !== undefined, "Entry type must be defined");
  assert(_.contains(dataTypes, entry.type), "Entry.type not supported!");
  if (entry.property === undefined) {
    entry.property = entry.key;
  }
  return entry;
};

/** Serialize type for storage in azure table service */
var serialize = function(value, entry) {
  assert(entry !== undefined, "entry must be given to serialize");

  // Find type
  var type    = entry.type;

  // Serialize string
  if (type == 'string' || type == 'number') {
    assert(
      typeof(value) == type,
      "Value '" + value + "' must be either a string or number for " +
      "property " + entry.property
    );
    return value;
  }
  // Serialize JSON
  if (type == 'json') {
    return JSON.stringify(value);
  }
  // Serialize data object
  if (type == 'date') {
    assert(
      value instanceof Date,
      "Value '" + value + "' must be an instance of Date object for " +
      "property " + entry.property
    );
    return value;
  }
  // Serialize slug to uuid which azure tables can encode efficiently
  if (type == 'slugid') {
    assert(value, "Slugs can't be empty string!!!");
    assert(value.length == 22, "Slugs should always be 22 chars long");
    return slugid.decode(value);
  }
  throw new Error("Can't serialize unknown type: '" + type + "' for " +
                  "property: '" + entry.property + "'!");
};

/** Deserialize type from storage in azure table service */
var deserialize = function(value, entry) {
  // Find type and value
  var type    = entry.type;

  if (type == 'string' || type == 'number') {
    assert(
      typeof(value) == type,
      "Value '" + value + "' must be either a string or number for " +
      "key '" + entry.key + "' instead we got " + typeof(value)
    );
    return value;
  }
  if (type == 'json') {
    return JSON.parse(value);
  }
  if (type == 'date') {
    assert(
      value instanceof Date,
      "Value '" + value + "' must be an instance of Date object for " +
      "key " + entry.key
    );
    return value;
  }
  if (type == 'slugid') {
    assert(typeof(value) == 'string', "Slugids should be returned from " +
           "azure as strings");
    return slugid.encode(value);
  }
  debug("Entry with unknown type: ", entry);
  throw new Error("Can't deserialize unknown type: '" + type + "' for " +
                  "key: '" + entry.key + "'!");
};

/**
 * Base class for all entity wrapper classes.
 * **Note**, when subclassing you must call Entity.subClass().
 */
var Entity = function(entity) {
  // Set __etag
  this.__etag = entity.__etag || null;

  // Create shadow object
  this.__shadow = {};

  // Set properties on shadow object
  var that = this;
  this.__mapping.forEach(function(entry) {
    that.__shadow[entry.property] = deserialize(entity[entry.key], entry);
  });
};

/**
 * Subclass Entity given a tableName and a entity mapping
 * **Note** that subclasses must also call the Entity constructor during
 * initialization.
 */
Entity.subClass = function(constructor, tableName, mapping) {
  // Inherit utility function
  util.inherits(constructor, Entity);

  // Save tableName and mapping for later use
  constructor.prototype.__tableName = tableName;
  constructor.prototype.__mapping   = mapping;

  /** Generate SAS signature for reading the underlying Azure Table */
  constructor.generateSAS = function() {
    // Let it expire in an hour
    var expires = new Date();
    expires.setHours(expires.getHours() + 1);
    return client.generateSAS(tableName, 'r', expires);
  };

  // Define read-only properties for the underlying shadow object.
  mapping.forEach(function(entry) {
    // Allow for hidden entries
    if (entry.hidden) {
      return;
    }
    // Define property for accessing underlying shadow object
    Object.defineProperty(constructor.prototype, entry.property, {
      enumerable:   true,
      get:          function() { return this.__shadow[entry.property]; }
    });
  });
};

/**
 * Create an entity on azure table with property and mapping.
 * Returns a promise for an Entity subclass created with constructor.
 */
Entity.create = function(properties, constructor) {
  assert(properties, "Properties is required");
  assert(constructor, "The constructor is require");

  // Return a promise that we inserted the entity
  return new Promise(function(accept, reject) {
    // Construct entity from properties
    var entity = {};
    constructor.prototype.__mapping.forEach(function(entry) {
      entity[entry.key] = serialize(properties[entry.property], entry);
    });

    // Insert entity
    client.insertEntity(constructor.prototype.__tableName, entity,
                        function(err, etag) {
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
    // Construct Entity subclass using constructor
    return new constructor(entity);
  });
};

/**
 * Load Entity subclass from azure given PartitionKey, RowKey and constructor,
 * This method return a promise for the subclass instance.
 */
Entity.load = function(partitionKey, rowKey, constructor) {
  // Serialize partitionKey and rowKey
  constructor.prototype.__mapping.forEach(function(entry) {
    if (entry.key == 'PartitionKey') {
      partitionKey = serialize(partitionKey, entry);
    }
    if (entry.key == 'RowKey') {
      rowKey = serialize(rowKey, entry);
    }
  });
  return new Promise(function(accept, reject) {
    client.getEntity(
      constructor.prototype.__tableName,
      partitionKey, rowKey,
      function(err, entity) {
      // Reject if there is an error
      if (err) {
        return reject(err);
      }

      // Accept constructed entity, we'll wrap below, to catch exceptions
      accept(entity);
    });
  }).then(function(entity) {
    // Construct and return Entity subclass using constructor
    return new constructor(entity);
  });
};

/**
 * Modify an entity instance, the `modifier` is a function that is called with
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
      that.__mapping.forEach(function(entry) {
        var newValue = serialize(properties[entry.property], entry)
        var oldValue = serialize(shadow[entry.property], entry);
        if (newValue != oldValue) {
          entityChanges[entry.key] = newValue;
          changed = true;
        }
        if (entry.key == 'PartitionKey' || entry.key == 'RowKey') {
          assert(
            newValue == oldValue,
            "You can't modify PartitionKey or RowKey as attempted with " +
            "property: " + entry.property
          );
          entityChanges[entry.key] = newValue;
        }
      });

      // Add previous etag for consistency
      entityChanges.__etag = etag;

      // If no property was changed, return immediately
      if (!changed) {
        debug("Return modify trivally as no changes was applied by modifier");
        return accept();
      }

      // Attempt to update the entity
      client.mergeEntity(that.__tableName, entityChanges, function(err, etag_) {
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
      var partitionKey, rowKey;
      that.__mapping.forEach(function(entry) {
        if (entry.key == 'PartitionKey') {
          partitionKey = serialize(shadow[entry.property], entry);
        }
        if (entry.key == 'RowKey') {
          rowKey = serialize(shadow[entry.property], entry);
        }
      });

      // Fetch entity from azure table
      client.getEntity(
        that.__tableName,
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
      that.__mapping.forEach(function(entry) {
        shadow[entry.property] = deserialize(entity[entry.key], entry);
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
  });
};


/** Subclass of Entity for representation of Tasks */
var Task = function(entity) {
  // Call base class constructor
  Entity.call(this, entity);
};

// Subclass entity, this declares read-only properties
Entity.subClass(Task, nconf.get('scheduler:azureTaskGraphTable'), [
  {
    key:              'PartitionKey',
    property:         'taskGraphId',
    type:             'string'
  }, {
    key:              'RowKey',
    property:         'taskId',
    type:             'string'
  }, {
    key:              'version',
    type:             'string'
  }, {
    key:              'label',
    type:             'string'
  }, {
    key:              'rerunsAllowed',
    type:             'number'
  }, {
    key:              'rerunsLeft',
    type:             'number'
  }, {
    key:              'deadline',
    type:             'date'
  }, {
    key:              'requires',
    type:             'json'
  }, {
    key:              'requiresLeft',
    type:             'json'
  }, {
    key:              'dependents',
    type:             'json'
  }, {
    key:              'resolution',
    type:             'json'
  }
].map(normalizeEntityMappingEntry));

/** Create task */
Task.create = function(properties) {
  return Entity.create(properties, Task);
};

/** Load task */
Task.load = function(taskGraphId, taskId) {
  return Entity.load(taskGraphId, taskId, Task);
};

/** Load all tasks for a given task-graph */
Task.loadPartition = function(taskGraphId) {
  return new Promise(function(accept, reject) {
    var tasks = [];
    var fetchNext = function(continuationTokens) {
      client.queryEntities(Task.prototype.__tableName, {
        query:      azureTable.Query.create()
                      .where('PartitionKey', '==', taskGraphId)
                      .and('RowKey', '!=', 'task-graph'),
        forceEtags: true,
        continuation: continuationTokens
      }, function(err, data, continuationTokens) {
        // Reject if we hit an error
        if (err) {
          return reject(err);
        }
        // Create wrapper for each task fetched
        tasks.push.apply(tasks, data.map(function(entity) {
          return new Task(entity);
        }));

        // If there are no continuation tokens then we accept data fetched
        if (!continuationTokens) {
          return accept(tasks);
        }
        // Fetch next set based on continuation tokens
        fetchNext(continuationTokens);
      });
    }
    fetchNext(undefined);
  });
};

// Export Task
exports.Task = Task;

/** Subclass of Entity for representation of TaskGraphs */
var TaskGraph = function(entity) {
  // Call base class constructor
  Entity.call(this, entity);
};

// Subclass entity, this declares read-only properties
Entity.subClass(TaskGraph, nconf.get('scheduler:azureTaskGraphTable'), [
  {
    key:              'PartitionKey',
    property:         'taskGraphId',
    type:             'string'
  }, {
    // This is always hardcoded to 'task-graph', so we can use the same table
    // for both TaskGraph and Task entities. This ensures that we can make
    // atomic operations should we ever need to do this.
    key:              'RowKey',
    type:             'string',
    hidden:           true
  }, {
    key:              'version',
    type:             'string'
  }, {
    key:              'requires',
    type:             'json'
  }, {
    key:              'requiresLeft',
    type:             'json'
  }, {
    key:              'state',
    type:             'string'
  }, {
    key:              'routing',
    type:             'string'
  }, {
    key:              'details',
    type:             'json'
  }
].map(normalizeEntityMappingEntry));

/** Create TaskGraph */
TaskGraph.create = function(properties) {
  properties.RowKey = 'task-graph';
  return Entity.create(properties, TaskGraph);
};

/** Load TaskGraph */
TaskGraph.load = function(taskGraphId) {
  return Entity.load(taskGraphId, 'task-graph', TaskGraph);
};

/** Get task-graph status structure */
TaskGraph.prototype.status = function() {
  return {
    taskGraphId:    this.taskGraphId,
    schedulerId:    nconf.get('scheduler:taskGraphSchedulerId'),
    state:          this.state,
    routing:        this.routing
  };
};

// Export TaskGraph
exports.TaskGraph = TaskGraph;

/**
 * Ensures the existence of a table, given a tableName or Entity subclass
 * Returns a promise of success.
 */
exports.ensureTable = function(table) {
  // Find table name from model, if model is given
  if (typeof(table) != 'string') {
    table = table.prototype.__tableName;
  }

  // Ensure table
  return new Promise(function(accept, reject) {
    client.createTable(table, {
      ignoreIfExists:     true
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
