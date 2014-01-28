// shortening
var getDescriptor = Object.getOwnPropertyDescriptor;
var EXTEND_PROPS = ['object', 'onbuild', 'oncreate'];

function propIsFactory(object, key) {
  // getDescriptor is used so objects created with Object.create(null);
  // will work.
  var descriptor = getDescriptor(object, key);
  if (!descriptor) return false;

  return (
    descriptor.value &&
    (descriptor.value instanceof Factory)
  );
}

/**
Copy properties (including getters) from one object to another
(without executing the getters).

@param {Object} from this source.
@param {Array} keys to copy.
@param {Object} to this target.
*/
function copyOwnProperties(from, keys, to) {
  keys.forEach(function(key) {
    // only copy keys on the current object
    if (!from.hasOwnProperty(key)) return;
    Object.defineProperty(to, key, getDescriptor(from, key));
  });

  return to;
}

/**
Copy own properties into the final argument.

    var target = {};
    copyOwnInto({ a: true  }, { b: true }, target);
    // target => { a: true, b: true }

@param {Object} source... of properties.
@param {Object} target for properties.
*/
function copyOwnInto() {
  var args = Array.prototype.slice.call(arguments);
  var target = args.pop();

  args.forEach(function(object) {
    if (!object) return;

    for (var key in object) {
      if (!object.hasOwnProperty(key)) continue;
      Object.defineProperty(target, key, getDescriptor(object, key));
    }
  });

  return target;
}

/* instance */

function Factory(options) {
  if (!(this instanceof Factory))
    return new Factory(options);

  this.properties = {};
  copyOwnInto(options, this);
}

Factory.prototype = {
  parent: null,
  object: Object,
  properties: null,

  extend: function(options) {
    var newFactory = {};

    // we need to copy the properties rather then do an assignment for lazy-est 
    // possible evaluation of properties.
    copyOwnProperties(
      this,
      EXTEND_PROPS,
      newFactory
    );

    copyOwnInto(options, newFactory);

    newFactory.properties = copyOwnInto(
      this.properties,
      newFactory.properties,
      {}
    );

    return new Factory(newFactory);
  },

  build: function(overrides, childFactoryMethod) {
    // null or undefined
    if (overrides == null) overrides = {};
    if (childFactoryMethod == null) childFactoryMethod = 'build';

    var defaults = {};
    var props = this.properties;

    copyOwnInto(props, overrides, defaults);

    // expand factories
    var factoryOverrides;
    var descriptor;

    for (var key in defaults) {
      // when default property is a factory
      if (propIsFactory(props, key)) {
        factoryOverrides = undefined;
        if (!propIsFactory(defaults, key)) {
          // user overrides defaults
          factoryOverrides = defaults[key];
        }
        defaults[key] = props[key][childFactoryMethod](
          factoryOverrides
        );
      }
    }

    if (typeof this.onbuild === 'function') {
      this.onbuild(defaults);
    }

    return defaults;
  },

  create: function(overrides) {
    var result = new this.object(this.build(overrides, 'create'));

    if (typeof this.oncreate === 'function') {
      this.oncreate(result);
    }

    return result;
  }
};

module.exports = Factory;
