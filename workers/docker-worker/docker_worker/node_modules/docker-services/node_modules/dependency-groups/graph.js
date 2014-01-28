function appendIfNotExists(array, item) {
  if (array.indexOf(item) !== -1) return false;
  array.push(item);
  return true;
}

function Groups() {
  this.nodes = {};
  this.dependencies = {};
  this.dependents = {};
}

function createOrGetNode(context, name) {
  if (!context.nodes[name]) {
    return context.nodes[name] = new Node(name);
  }
  return context.nodes[name];
}

Groups.prototype = {
  _traverseReadyNodes: function() {
    var target = [];
    var hasNodes = false;

    // find the nodes without parent
    Object.keys(this.nodes).forEach(function(node) {
      hasNodes = true;
      // is a root node
      if (this.dependencies[node].length) return;
      target.push(node);
    }, this);

    // cannot resolve a layer of dependencies (cycle)
    if (hasNodes && !target.length) {
      throw new Error('cyclic dependency detected... cannot continue');
    }

    target.forEach(function(name) {
      var dependants = this.dependents[name];
      if (dependants) {
        dependants.forEach(function(node) {
          var dependencies = this.dependencies[node];

          var idx = dependencies.indexOf(name);
          if (idx !== -1) dependencies.splice(idx, 1);
        }, this);
      }

      delete this.nodes[name];
      delete this.dependencies[name];
      delete this.dependents[name];
    }, this);

    if (!target.length) return null;
    return target;
  },

  hasNode: function(name) {
    return !!this.nodes[name];
  },

  addNode: function(name) {
    if (this.hasNode(name)) return false;

    this.nodes[name] = name;
    this.dependencies[name] = [];
    this.dependents[name] = [];
  },

  relateNodes: function(parent, child) {
    if (!this.hasNode(parent)) {
      throw new Error('Cannot relate node without a parent');
    }

    // ensure the child node exists or create it.
    this.addNode(child);

    appendIfNotExists(this.dependencies[parent], child);
    appendIfNotExists(this.dependents[child], parent);


    // check for cyclic references
    if (
      this.dependents[child].indexOf(parent) !== -1 &&
      this.dependents[parent].indexOf(child) !== -1
    ) {
      throw new Error(
        'cyclic dependency detected ' + child + ' depends on ' + parent + ' ' +
        'and vice versa'
      );
    }
  },

  /**
  Traverse graph grouping dependencies that can run in parallel.
  All nodes/dependencies are removed in this process.

  @return {Array}
  */
  consume: function() {
    var results = [];
    var resolved = {};

    while ((group = this._traverseReadyNodes())) {
      results.push(group);
    }

    return results;
  }
};

module.exports = Groups;
