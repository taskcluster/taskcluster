'use strict';

const errors = require('./errors');

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

module.exports = {
  WMObject,
};
