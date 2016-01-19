let util = require('util');
let assume = require('assume');
let debug = require('debug')('taskcluster:loader');
let Promise = require('promise');
let _ = require('lodash');
let TopoSort = require('topo-sort');


// see babel issue 2215
function includes(a, v) {
  if (a.indexOf(v) === -1) {
    return false;
  }
  return true;
}


/** Validate component definition */
function validateComponent(def, name) {
  let e = "Invalid component definition: " + name;
  // Check that it's an object
  if (typeof(def) !== 'object' && def !== null && def !== undefined) {
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
    if (!def.requires.every(entry => typeof(entry) === 'string')) {
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
 *
 * The `componentDirectory` is an object mapping from component names to
 * component loaders as follows:
 * ```js
 * let load = loader({
 *   // Component loader that always returns 'test'
 *   profile: {
 *     setup: () => 'test'
 *   },
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
 * Sometimes it's not convenient to hard code constant values into the component
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
function loader(componentDirectory, virtualComponents = []) {
  assume(componentDirectory).is.an('object');
  assume(virtualComponents).is.an('array');
  assume(_.intersection(
    _.keys(componentDirectory), virtualComponents)
  ).has.length(0);
  componentDirectory = _.clone(componentDirectory);

  // Check for undefined components
  _.forEach(componentDirectory, (def, name) => {
    validateComponent(def, name);
    for(let dep of def.requires || []) {
      if (!componentDirectory[dep] && !includes(virtualComponents, dep)) {
        throw new Error('Cannot require undefined component: ' + dep);
      }
    }
  });

  // Do topological sort to check for cycles
  let tsort = new TopoSort();
  _.forEach(componentDirectory, (def, name) => {
    tsort.add(name, def.requires || []);
  });
  for (let name of virtualComponents) {
    tsort.add(name, []);
  }
  let topoSorted = tsort.sort();

  // Add graphviz target
  if (componentDirectory.graphviz || includes(virtualComponents, 'graphviz')) {
    throw new Error('graphviz is reserved for an internal component');
  }
  componentDirectory.graphviz = {
    setup: () => renderGraph(componentDirectory, topoSorted)
  };
  // Add dump-dot target, which will print to terminal (useful for debugging)
  if (componentDirectory['dump-dot'] ||
      includes(virtualComponents, 'dump-dot')) {
    throw new Error('dump-dot is reserved for an internal component');
  }
  componentDirectory['dump-dot'] = {
    setup: () => console.log(renderGraph(componentDirectory, topoSorted))
  };

  return function(target, options = {}) {
    options = _.clone(options);
    if (typeof target !== 'string') {
      debug(`Target is type ${typeof target}, not string`);
    }
    assume(target).is.a('string');
    // Check that all virtual components are defined
    assume(options).is.an('object');
    for (let vComp of virtualComponents) {
      if (!options[vComp]) {
        debug(`Requested component ${vComp} does not exist in loader`);
      }
      assume(options[vComp]).exists();
    }

    // Keep state of loaded components, make the virtual ones immediately loaded
    let loaded = {};
    _.forEach(options, (comp, key) => {
      loaded[key] = Promise.resolve(comp);
    });

    // Load a component
    function load(target) {
      if (!loaded[target]) {
        var def = componentDirectory[target];
        // Initialize component, this won't cause an infinite loop because
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
