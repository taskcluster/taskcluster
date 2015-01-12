var base        = require('taskcluster-base');
var assert      = require('assert');
var Promise     = require('promise');
var _           = require('lodash');

/** Entities for indexed tasks */
var IndexedTask = base.Entity.configure({
  version:          1,
  partitionKey:     base.Entity.keys.HashKey('namespace'),
  rowKey:           base.Entity.keys.StringKey('name'),
  properties: {
    namespace:      base.Entity.types.String,
    name:           base.Entity.types.String,
    rank:           base.Entity.types.Number,
    taskId:         base.Entity.types.SlugId,
    data:           base.Entity.types.JSON,
    expires:        base.Entity.types.Date
  }
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
    expires:      this.expires.toJSON()
  };
};


/** Entities for namespaces */
var Namespace = base.Entity.configure({
  version:          1,
  partitionKey:     base.Entity.keys.HashKey('parent'),
  rowKey:           base.Entity.keys.StringKey('name'),
  properties: {
    parent:         base.Entity.types.String,
    name:           base.Entity.types.String,
    expires:        base.Entity.types.Date
  }
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
    expires:    this.expires.toJSON()
  };
};

/** Create namespace structure */
Namespace.ensureNamespace = function(namespace, expires) {
  var Class = this;

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
  return Class.load({
    parent:   parent,
    name:     name
  }).then(function(folder) {
    // Modify the namespace
    return folder.modify(function() {
      // Check if we need to update expires
      if (this.expires < expires) {
        // Update expires
        this.expires = expires;

        // Update all parents first though
        return Namespace.ensureNamespace.call(Class, namespace, expires);
      }
    });
  }, function(err) {
    // Re-throw exception, if it's not because the namespace is missing
    if (!err || err.code !== 'ResourceNotFound') {
      throw err;
    }

    // Create parent namespaces
    return Namespace.ensureNamespace.call(
      Class,
      namespace,
      expires
    ).then(function() {
      // Create namespace
      return Class.create({
        parent:       parent,
        name:         name,
        expires:      expires
      }).then(null, function(err) {
        // Re-throw error if it's because the entity was constructed while we
        // waited
        if (!err || err.code !== 'EntityAlreadyExists') {
          throw err;
        }

        return Class.load({
          parent:   parent,
          name:     name
        });
      });
    });
  });
};
