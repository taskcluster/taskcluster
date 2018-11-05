'use strict';

/**
 * This module contains functions, data and classes which are relevant broadly
 * across the Worker Manager codebase.
 */

const util = require('util');
const fs = require('fs');
const pathlib = require('path');
const [readdir, stat] = [fs.readdir, fs.stat].map(util.promisify);

// These are the strings for which we want to generate matching error types.
// They will also be set as the code property on the instances of each error
// type

class UnknownError extends Error {
  constructor(msg, properties) {
    super(msg);
    if (typeof properties === 'object') {
      Object.assign(this, properties);
    }
    this.code = this.constructor.name;
  }
};

// Sadly, errors which are base classes for other errors need
// to be declared outside the loop. Luckily there's few
class InvalidWorkerConfiguration extends UnknownError {};

const _errors = [
  UnknownError,
  InvalidWorkerConfiguration,
  class MethodUnimplemented extends UnknownError {},
  class InvalidIdentifier extends UnknownError {},
  class InvalidSatisfiers extends InvalidWorkerConfiguration {},
  class InvalidConditions extends InvalidWorkerConfiguration {},
  class InvalidValues extends InvalidWorkerConfiguration {},
  class InvalidRules extends InvalidWorkerConfiguration {},
  class InvalidDatastoreNamespace extends UnknownError {},
  class InvalidDatastoreKey extends UnknownError {},
  class InvalidDatastoreValue extends UnknownError {},
  class InvalidWorkerType extends UnknownError {},
  class InvalidBid extends UnknownError {},
  class InvalidWorker extends UnknownError {},
  class InvalidProvider extends UnknownError {},
  class InvalidBiddingStrategy extends UnknownError {},
  class InvalidPluginConfiguration extends UnknownError {},
];

let x = {}
for (let error of _errors) {
  if (x[error.name]) {
    throw new Error('Duplicated Error: ' + error.name);
  }
  x[error.name] = error;
}

const errors = new Proxy(x, {
  get: function (target, prop, receiver) {
    const e = Reflect.get(...arguments);
    if (!e) {
      throw new UnknownError('Unknown Error Type: ' + prop);
    }
    return e;
  }
});

/**
 * This class defines a common base class for all Worker Manager concept
 * objects.  This is done to help standardize logging and error handling.  A
 * concept object is any object which is involved in any Worker Manager
 * abstraction, but is not any of the objects which interact with other
 * frameworks.  Examples are bidding strategies, providers, implementations
 * there of and worker configurations.
 *
 * All of these objects have an ID which must be set in the WMObject constructor
 * and provide a ._throw(Error, msg, properties) function for throwing errors.
 *
 * In future, they will also provide logging.
 */
class WMObject {
  constructor(opts) {
    if (typeof opts !== 'object' || typeof opts.id !== 'string') {
      this._throw(errors.InvalidIdentifier);
    }
    this.id = opts.id;
  }

  /**
   * Throw an exception of type `code` with msg of and Object.assign() the
   * properties of the `properties` object.
   */
  _throw(code, msg, properties) {
    if (!code) {
      code = errors.UnknownError;
    }
    const err = new code(msg ? `${code.name}: ${msg}` : code.name);
    Object.assign(err, properties);
    err.code = code.name;
    err.id = this.id || '<unknown-id>';
    err.fromType = this.constructor.name;
    throw err;
  }
}

/**
 * This function loads a Plugin in a generalised manner.
 * This design is intentionally kept as minimal as possible to enable
 * a simple extensibility model without creating too complex a model.
 * 
 * All plugins must:
 *   1. Be in a file named the all lower case version of their className.
 *   Example: `EC2Provider` -> `ec2provider.js`
 *   2. Must provide a property named exactly `className`.  May optionally
 *   export other properties.  Example: for `className = 'Fake'`, use
 *   `module.exports = {Fake}` in a file `fake.js`
 *   3. Must derive from the `type` constructor
 *   4. All classes which are loaded from this method must allow creation
 *   based only upon a set of JSON-serializable arguments
 *   5. must be located in `dir` sub-directory
 *
 * This function returns the class, not an instance
 */
function loadPlugin(type, dir, className) {
  // These calls to require must be here and not globally, otherwise an import
  // loop happens and the WMObject class is undefined when these modules are
  // imported the first time.  Thankfully, require() does caching so this is as
  // close to zero-cost as we could expect
  let file = pathlib.join(__dirname, dir, className.toLowerCase());

  // Bad names because I don't want to override globals and can't use keywords
  let m = require(file);
  let clazz = m[className];

  if (!clazz) {
    throw new errors.InvalidPluginConfiguration(`${className} not found in ${file} exports`);
  }

  if (/*!clazz.prototype === type ||*/ !clazz.prototype instanceof type) {
    throw new errors.InvalidPluginConfiguration(`${file}:exports.${clazz.name} does not derive from ${type.name}`);
  }

  return clazz;
}

module.exports = {
  WMObject,
  errors,
  loadPlugin,
};
