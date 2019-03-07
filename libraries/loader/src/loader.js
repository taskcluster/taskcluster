const util = require('util');
const assume = require('assume');
const TopoSort = require('topo-sort');
const debug = require('debug')('taskcluster-lib-loader');

/**
 * Validate component definition
 */
function validateComponent(def, name) {
  let e = 'Invalid component definition: ' + name;
  // Check that it's an object
  if (typeof def !== 'object' && def !== null && def !== undefined) {
    throw new Error(e + ' must be an object, null or undefined');
  }
  // Check that is object has a setup function
  if (!(def.setup instanceof Function)) {
    throw new Error(e + ' is missing setup function');
  }
  // If requires is defined, then we check that it's an array of strings
  if (def.requires) {
    if (!(def.requires instanceof Array)) {
      throw new Error(e + ' if present, requires must be array');
    }
    // Check that all entries in def.requires are strings
    if (!def.requires.every(entry => typeof entry === 'string')) {
      throw new Error(e + ' all items in requires must be strings');
    }
  }
}

/**
 * Render componentDirectory to dot format for graphviz given a
 * topologically sorted list of components
 */
function renderGraph(componentDirectory, sortedComponents) {
  let dot = [
    '// This graph shows all dependencies for this loader.',
    '// You might find http://www.webgraphviz.com/ useful!',
    '',
    'digraph G {',
  ];

  for (let component of sortedComponents) {
    dot.push(util.format('  "%s"', component));
    let def = componentDirectory[component] || {};
    for (let dep of def.requires || []) {
      dot.push(util.format('  "%s" -> "%s" [dir=back]', dep, component));
    }
  }
  dot.push('}');

  return dot.join('\n');
}

/*
 * Construct a component loader function.
 * Usage is detailed in README.
 */
function loader(componentDirectory, virtualComponents = {}) {
  assume(componentDirectory).is.an('object');
  if (virtualComponents instanceof Array) {
    virtualComponents = virtualComponents.reduce((acc, k) => {
      acc[k] = null;
      return acc;
    }, {});
  }
  const virtualKeys = Object.keys(virtualComponents);
  assume(Object.keys(componentDirectory).filter(x => virtualKeys.includes(x))).has.length(0);
  componentDirectory = Object.assign({}, componentDirectory);

  // Check for undefined components
  Object.entries(componentDirectory).forEach(([name, def]) => {
    validateComponent(def, name);
    for (let dep of def.requires || []) {
      if (!componentDirectory.hasOwnProperty(dep) && !virtualComponents.hasOwnProperty(dep)) {
        throw new Error('Cannot require undefined component: ' + dep);
      }
    }
  });

  // Do topological sort to check for cycles
  let tsort = new TopoSort();
  Object.entries(componentDirectory).forEach(([name, def]) => {
    tsort.add(name, def.requires || []);
  });
  for (let name of Object.keys(virtualComponents)) {
    tsort.add(name, []);
  }
  let topoSorted = tsort.sort();

  // Add graphviz target
  if (componentDirectory.graphviz || virtualComponents.graphviz) {
    throw new Error('graphviz is reserved for an internal component');
  }
  componentDirectory.graphviz = {
    setup: () => renderGraph(componentDirectory, topoSorted),
  };
  // Add dump-dot target, which will print to terminal (useful for debugging)
  if (componentDirectory['dump-dot'] || virtualComponents['dump-dot']) {
    throw new Error('dump-dot is reserved for an internal component');
  }
  componentDirectory['dump-dot'] = {
    setup: () => console.log(renderGraph(componentDirectory, topoSorted)),
  };

  let load = function(target, options = {}) {
    options = Object.assign({}, options);

    if (typeof target !== 'string') {
      throw new Error(`Target ${target} is type ${typeof target}, not string`);
    }

    // Check that target is defined
    if (!componentDirectory[target] && !virtualComponents[target]) {
      throw new Error(`Target ${target} is not defined`);
    }

    // Check that all virtual components are defined
    if (typeof options !== 'object') {
      throw new Error('options must be an object');
    }
    options = Object.assign({}, virtualComponents, options);
    for (const vComp of Object.keys(options)) {
      if (!options[vComp]) {
        throw new Error(`Requested component '${vComp}' does not exist in loader`);
      }
    }

    // Keep state of loaded components, make the virtual ones immediately loaded
    let loaded = {};
    Object.entries(options).forEach(([key, comp]) => {
      loaded[key] = Promise.resolve(comp);
    });
    // Load a component
    function recursiveLoad(target) {
      if (!loaded[target]) {
        let def = componentDirectory[target];
        // Initialize component, this won't cause an infinite loop because
        // we've already check that the componentDirectory is a DAG
        let requires = def.requires || [];
        return loaded[target] = Promise.all(requires.map(recursiveLoad)).then(deps => {
          let ctx = {};
          for (let i = 0; i < deps.length; i++) {
            ctx[def.requires[i]] = deps[i];
          }
          return new Promise((resolve, reject) => {
            try {
              resolve(def.setup.call(null, ctx));
            } catch (err) {
              reject(err);
            }
          }).catch(function(err) {
            debug(`error while loading component '${target}': ${err}`);
            throw err;
          });
        });
      }
      return loaded[target];
    }
    return recursiveLoad(target);
  };

  load.crashOnError = function(target) {
    load(target).catch(err => {
      console.log(err.stack);
      process.exit(1);
    });
  };
  return load;
}

module.exports = loader;
