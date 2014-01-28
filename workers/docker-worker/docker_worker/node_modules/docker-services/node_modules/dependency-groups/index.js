var Graph = require('./graph');

/**
Attach a item on the list to the new dependencies and repeat the process for
the dependencies children (recursive).
*/
function dependOn(originalDeps, newDeps, name) {
  if (newDeps[root]) return;
  newDeps[name] = originalDeps[name];
  newDeps[name] && newDeps[name].forEach(function(name) {
    dependOn(originalDeps, newDeps, name);
  });
}

/**
Rebuild the dependency list from a select group of "root" nodes.
*/
function graphRoots(deps, roots) {
  var newDeps = {};

  var attachRoots = dependOn.bind(this, deps, newDeps);
  roots.forEach(attachRoots);
  return groupDependencies(newDeps);
}

/**
@param {Object} deps list of dependencies by name: [dep, dep]
@param {Array} [roots] optional list of roots to resolve.
*/
function groupDependencies(deps, roots) {
  if (roots) return graphRoots(deps, roots);

  var graph = new Graph();

  Object.keys(deps).map(function(parent) {
    graph.addNode(parent);

    // related children to the parent
    var children = deps[parent];
    children && children.forEach(graph.relateNodes.bind(graph, parent));
  });

  return graph.consume();
}

module.exports = groupDependencies;
