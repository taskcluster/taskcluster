let assume = require('assume');
let debug = require('debug')('taskcluster:loader');
let Promise = require('promise');

function loader(componentDirectory, requiredVirtualComponents) {
  /**
   * If present, this is a list of component names that a loader
   * must define.  These are likely things like configuration values
   */
  if (requiredVirtualComponents) {
    assume(requiredVirtualComponents).is.array();
  } else {
    requiredVirtualComponents = [];
  }

  return function(virtualComponents) {
    let initializedComponents = {};

    function loadComponent(name, visited) {
      assume(name).to.be.ok();

      if (!visited) {
        visited = [];
      } else if (visited.includes(name)) {
        let errStr = 'Component ' + name + 
          ' is involved in a dependency cycle with ' + JSON.stringify(visited);
        debug(errStr);
        throw new Error(errStr);
      }

      /**
       * If we already have initialized this component for this loader we don't
       * want to re-initialize it
       */
      if (initializedComponents[name]) {
        debug('Using previously loaded %s', name);
        return initializedComponents[name];
      }

      /**
       * A virtual component is one that is not defined in the major directory.
       * We define a second level of component directory which is mainly for
       * doing things like presenting configuration values
       */
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
