let util = require('util');
let assume = require('assume');
let debug = require('debug')('taskcluster:loader');
let Promise = require('promise');
let _ = require('lodash');
let TopoSort = require('topo-sort');

/** Check if a value is a flat value or a component definition */
function isComponent(def) {
  // Check that it's an object
  if (typeof(def) !== 'object' && def !== null && def !== undefined) {
    return false;
  }
  // Check that is object has a setup function
  if (!(def.setup instanceof Function)) {
    return false;
  }
  // If requires is defined, then we check that it's an array of strings
  if (def.requires) {
    if (!(def.requires instanceof Array)) {
      return false;
    }
    // Check that all entries in def.requires are strings
    return def.requires.every(entry => typeof(entry) === 'string');
  }
  return true;
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
    let def = componentDirectory[component];
    if (def && isComponent(def)) {
      for (let dep of def.requires || []) {
        dot.push(util.format('  "%s" -> "%s" [dir=back]', component, dep));
      }
    }
  }
  dot.push('}');

  return dot.join('\n');
}

/*
 * Construct a component loader function.
 *
 * The `componentDirectory` is an object mapping from component names to
 * component loaders or flat values as follows:
 * ```js
 * let load = loader({
 *   // Flat value
 *   profile: 'test',
 *
 *   // Component loader that requires profile as input to the setup function
 *   config: {
 *     requires: ['profile'],
 *     setup: (options) => {
 *       return base.config({profile: options.profile});
 *     }
 *   },
 *
 *   // Component loader that loads asynchronously
 *   requestedValue: {
 *     requires: ['config'],
 *     setup: async (options) => {
 *       let res = await request.get(config.some_url).get().end();
 *       return res.body;
 *     }
 *   },
 *
 *   // Component loader that requires more than one component
 *   server: {
 *     requires: ['config', 'requestedValue'],
 *     setup: (options) => {
 *       return server.startListening({
 *         config: options.config,
 *         input: options.requestedValues,
 *       });
 *     }
 *   }
 * });
 * ```
 * With this `load` function you can load the server using:
 * ```js
 * let server = await load('server');
 * ```
 * Naturally, you can also load config `await load('config');` which is useful
 * for testing.
 *
 * Sometimes it's not convenient to hard code flat values into the component
 * directory, in the example above someone might want to load the
 * components with a different profile. Instead you can specify "profile" as
 * a `virtualComponents`, then it must be provided as an options when loading.
 *
 * ```js
 * let load = loader({
 *   // Component loader that requires profile as input to the setup function
 *   config: {
 *     requires: ['profile'],
 *     setup: (options) => {
 *       return base.config({profile: options.profile});
 *     }
 *   }
 * }, ['profile']);
 * ```
 *
 * Then you'll be able to load config as:
 * ```js
 * let config = await load('config', {profile: 'test'});
 * ```
 */
function loader (componentDirectory, virtualComponents = []) {
  assume(componentDirectory).is.an('object');
  assume(virtualComponents).is.an('array');
  assume(_.intersection(
    _.keys(componentDirectory), virtualComponents)
  ).has.length(0);
  componentDirectory = _.clone(componentDirectory);

  // Check for undefined components
  _.forEach(componentDirectory, (def, name) => {
    if (isComponent(def)) {
      for(let dep of def.requires || []) {
        if (!componentDirectory[dep] && !virtualComponents.includes(dep)) {
          throw new Error('Cannot require undefined component: ' + dep);
        }
      }
    }
  });

  // Do topological sort to check for cycles
  let tsort = new TopoSort();
  _.forEach(componentDirectory, (def, name) => {
    if (isComponent(def)) {
      tsort.add(name, def.requires || []);
    } else {
      tsort.add(name, []);
    }
  });
  for (let name of virtualComponents) {
    tsort.add(name, []);
  }
  let topoSorted = tsort.sort();

  // Add graphviz target, if it doesn't exist, we'll just render it as string
  if (componentDirectory.graphviz || virtualComponents.includes('graphviz')) {
    throw new Error('graphviz is reserved for an internal component');
  }
  componentDirectory.graphviz = renderGraph(componentDirectory, topoSorted);

  return function(target, options = {}) {
    options = _.clone(options);
    assume(target).is.a('string');
    // Check that all virtual components are defined
    assume(options).is.an('object');
    for (let vComp of virtualComponents) {
      assume(options[vComp]).exists();
    }

    // Keep state of loaded components, make the virtual ones immediately loaded
    let loaded = {};
    for (let vComp of virtualComponents) {
      loaded[vComp] = Promise.resolve(options[vComp]);
    }

    // Load a component
    function load(target) {
      if (!loaded[target]) {
        var def = componentDirectory[target];
        // If component is a flat value we don't have to call setup
        if (!isComponent(def)) {
          return loaded[target] = Promise.resolve(def);
        }
        // Otherwise we initialize, this won't cause an infinite loop because
        // we've already check that the componentDirectory is a DAG
        let requires = def.requires || [];
        return loaded[target] = Promise.all(requires.map(load)).then(deps => {
          let ctx = {};
          for(let i = 0; i < deps.length; i++) {
            ctx[def.requires[i]] = deps[i];
          }
          return def.setup.call(null, ctx);
        });
      }
      return loaded[target];
    };

    return load(target);
  };
};

// Export loader
module.exports = loader;
