var assert      = require('assert');
var _           = require('lodash');
var Entity      = require('azure-entities');

/** Entities for indexed tasks */
var IndexedTask = Entity.configure({
  version:          1,
  partitionKey:     Entity.keys.HashKey('namespace'),
  rowKey:           Entity.keys.StringKey('name'),
  properties: {
    namespace:      Entity.types.String,
    name:           Entity.types.String,
    rank:           Entity.types.Number,
    taskId:         Entity.types.SlugId,
    data:           Entity.types.JSON,
    expires:        Entity.types.Date,
  },
});

// Export IndexedTask
exports.IndexedTask = IndexedTask;

/** Get JSON representation of indexed task */
IndexedTask.prototype.json = function() {
  var ns = this.namespace + '.' + this.name;
  // Remove separate if there is no need
  if (this.namespace.length === 0 || this.name.length === 0) {
    ns = this.namespace + this.name;
  }
  return {
    namespace:    ns,
    taskId:       this.taskId,
    rank:         this.rank,
    data:         _.cloneDeep(this.data),
    expires:      this.expires.toJSON(),
  };
};

/** Entities for namespaces */
var Namespace = Entity.configure({
  version:          1,
  partitionKey:     Entity.keys.HashKey('parent'),
  rowKey:           Entity.keys.StringKey('name'),
  properties: {
    parent:         Entity.types.String,
    name:           Entity.types.String,
    expires:        Entity.types.Date,
  },
});

// Export Namespace
exports.Namespace = Namespace;

/** JSON representation of namespace */
Namespace.prototype.json = function() {
  var ns = this.parent + '.' + this.name;
  // Remove separate if there is no need
  if (this.parent.length === 0 || this.name.length === 0) {
    ns = this.parent + this.name;
  }
  return {
    namespace:  ns,
    name:       this.name,
    expires:    this.expires.toJSON(),
  };
};

/** Create namespace structure */
Namespace.ensureNamespace = function(namespace, expires) {
  var that = this;

  // Stop recursion at root
  if (namespace.length === 0) {
    return Promise.resolve(null);
  }

  // Round to date to avoid updating all the time
  expires = new Date(
    expires.getFullYear(),
    expires.getMonth(),
    expires.getDate(),
    0, 0, 0, 0
  );

  // Parse namespace
  if (!(namespace instanceof Array)) {
    namespace = namespace.split('.');
  }

  // Find parent and folder name
  var name    = namespace.pop() || '';
  var parent  = namespace.join('.');

  // Load namespace, to check if it exists and if we should update expires
  return that.load({
    parent:   parent,
    name:     name,
  }).then(function(folder) {
    // Modify the namespace
    return folder.modify(function() {
      // Check if we need to update expires
      if (this.expires < expires) {
        // Update expires
        this.expires = expires;
        
        // Update all parents first though
        return Namespace.ensureNamespace.call(that, namespace, expires);
      }
    });
  }, function(err) {
    // Re-throw exception, if it's not because the namespace is missing
    if (!err || err.code !== 'ResourceNotFound') {
      throw err;
    }

    // Create parent namespaces
    return Namespace.ensureNamespace.call(
      that,
      namespace,
      expires
    ).then(function() {
      // Create namespace
      return that.create({
        parent:       parent,
        name:         name,
        expires:      expires,
      }).then(null, function(err) {
        // Re-throw error if it's not because the entity was constructed while we
        // waited
        if (!err || err.code !== 'EntityAlreadyExists') {
          throw err;
        }

        return that.load({
          parent:   parent,
          name:     name,
        });
      });
    });
  });
};

/**Delete expired entries */
Namespace.expireEntries = function(parent, indexedTask, continuationToken=null) {
  console.log(`expireEntries in '${parent}' with token '${continuationToken}'`);
  return this.query({
    parent: parent,
  },
  {
    limit:         500,
    continuation:   continuationToken,
  }).then(async (data) => { 
    var dataLength = data.entries.length;
    
    for (var i=0; i<dataLength; i++) {
      let entry = data.entries[i];
      console.log(`..entry ${JSON.stringify(entry)}`);
      let namespace = parent + '.' + entry.name;
      if (parent.length === 0 || entry.name.length === 0) {
        namespace = parent + entry.name;
      }
      await this.expireEntries(namespace, indexedTask);

      // insertTask is careful to update expires of entries 
      // from the root out to the leaf. A parent's expires is
      // always later than the child's. Hence, we can delete an
      // entry without checking its children.
      await indexedTask.expireTasks(namespace);
      if (entry.expires.getTime() < Date.now()) {
        console.log(`remove namespace ${namespace}`);
        //entry.remove(false, true);
      }
    }

    if (data.continuation) {
      await Namespace.expireEntries(parent, indexedTask, data.continuation);
    }
  });   
};

IndexedTask.expireTasks = function(namespace, continuationToken=null) {

  return this.query({
    namespace: namespace,
  },
  {
    limit:         500,
    continuation:   continuationToken,
  }).then(async (data) => {
    var dataLength = data.entries.length;

    for (var i=0; i<dataLength; i++) {
      task = data.entries[i];
      if (task.expires.getTime() < Date.now()) {
        console.log(`remove task ${namespace}.${task.name}`);
        //task.remove(false, true);
      }
    }

    if (data.continuation) {
      await IndexedTask.expireTasks(namespace, data.continuation) ;
    }
  });
};
