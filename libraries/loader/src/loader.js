let util = require('util');
let assume = require('assume');
let debug = require('debug')('taskcluster:loader');
let Promise = require('promise');
let _ = require('lodash');
let TopoSort = require('topo-sort');

// We use this closure to create a .create() method which
// returns a graphViz file for a given component directory
function generateGraph(dir, vComp) {
  let tsort = new TopoSort();

  for (let x of _.keys(dir)) {
    tsort.add(x, dir[x].requires || []);
  }

  for (let x of _.keys(vComp)) {
    tsort.add(x, vComp[x].requires || []);
  }

  let components = tsort.sort();

  let dot = [
    '// This graph shows all dependencies for this loader',
    '// including virtual dependencies.',
    '// You might find http://www.webgraphviz.com/ useful!',
    '',
    'digraph G {',
  ];

  for (let component of components) {
    dot.push(util.format('  "%s"', component));
    let node = dir[component] || vComp[component];
    for (let dependency of node.requires || []) {
      dot.push(util.format('  "%s" -> "%s" [dir=back]', component, dependency));
    }
  }
  dot.push('}');

  dot = dot.join('\n');

  return dot;
}

function loader(componentDirectory, requiredVirtualComponents = []) {
  assume(componentDirectory).is.an('object');
  assume(requiredVirtualComponents).is.an('array');
  assume(_.intersection(_.keys(componentDirectory), requiredVirtualComponents)).has.length(0);

  let knownComponents = _.keys(componentDirectory).concat(requiredVirtualComponents);

  return function(virtualComponents = {}) {
    assume(virtualComponents).is.an('object');

    let graphViz;
    try {
      graphViz = generateGraph(componentDirectory, virtualComponents);
    } catch (err) {
      if (err.message.match(/^At least \d+ circular dependency in nodes/)) {
        let errStr = util.format('Cyclical dependency: %s', err.message);
        debug(errStr);
        throw new Error(errStr);
      }
      throw err;
    }

    let internalComponents = {
      graphviz: graphViz,
      table: '(╯°□°）╯︵ ┻━┻',
    };
    
    for (let iComp of _.keys(internalComponents)) {
      if (componentDirectory[iComp] || virtualComponents[iComp]) {
        let errStr = iComp + ' is reserved for internal loader target';
        debug(errStr);
        throw new Error(errStr);
      }
    }

    assume(virtualComponents).does.not.include('graphviz');

    let initializedComponents = {};

    function loadComponent(name, visited = []) {
      assume(name).to.be.ok();
      assume(name).is.a('string');
      assume(visited).is.an('array');

      if (internalComponents[name]) {
        if (typeof internalComponents[name] === 'function') {
          return internalComponents[name];
        }
        return internalComponents[name];
      }

      if (visited.includes(name)) {
        let errStr = 'Component ' + name + 
          ' is involved in a dependency cycle with ' + JSON.stringify(visited);
        debug(errStr);
        throw new Error(errStr);
      }

      // If we already have initialized this component for this loader we don't
      // want to re-initialize it
      if (initializedComponents[name]) {
        debug('Using previously loaded %s', name);
        return initializedComponents[name];
      }

      // A virtual component is one that is not defined in the major directory.
      // We define a second level of component directory which is mainly for
      // doing things like presenting configuration values
      let component;
      if (requiredVirtualComponents.includes(name)) {
        component = virtualComponents[name];
        if (!component) {
          let errStr = 'Component ' + name + ' must be a virtual component';
          debug(errStr);
          throw new Error(errStr);
        }
      } else {
        component = componentDirectory[name];
        if (!component) {
          let errStr = 'Component ' + name + ' must not be a virtual component';
          debug(errStr);
          throw new Error(errStr);
        }
      }

      let components = {};
      let componentValue;

      if (typeof component === 'object' && typeof component.setup === 'function') {
        for (let requirement of component.requires || []) {
          debug('loading requirement of %s: %s', name, requirement);
          components[requirement] = loadComponent(requirement, visited.concat([name]));
        }
        componentValue = component.setup.call(null, components);
      } else {
        debug('component is a flat value');
        componentValue = component;
      }

      if (!componentValue) {
        console.log(component);
        let errStr = 'Unable to initialize ' + name;
        debug(errStr);
        throw new Error(errStr);
      }
      initializedComponents[name] = Promise.resolve(componentValue);

      return initializedComponents[name]; 
    };

    return loadComponent;
  };
};

module.exports = loader;
