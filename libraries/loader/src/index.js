const assert = require('assert');
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

/*
 * Construct a component loader function.
 * Usage is detailed in README.
 */
function loader(componentDirectory, virtualComponents = {}) {
  assert(typeof componentDirectory === 'object');
  if (virtualComponents instanceof Array) {
    virtualComponents = virtualComponents.reduce((acc, k) => {
      acc[k] = null;
      return acc;
    }, {});
  }
  const virtualKeys = Object.keys(virtualComponents);
  assert(Object.keys(componentDirectory).every(k => !virtualKeys.includes(k)),
    'virtual keys must not have definitions in the loader');
  componentDirectory = Object.assign({}, componentDirectory);

  // Check for undefined components
  Object.entries(componentDirectory).forEach(([name, def]) => {
    validateComponent(def, name);
    for (let dep of def.requires || []) {
      if (!(dep in componentDirectory) && !(dep in virtualComponents)) {
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
  tsort.sort();

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
      if (!(vComp in options)) {
        throw new Error(`Virtual component '${vComp}' does not exist in loader`);
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
              resolve(def.setup.call(null, ctx, target));
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
