'use strict';

const util = require('util');

// This file defines standard worker manager error codes as well
// as a standardised method of throwing these errors

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

const errors = [
  UnknownError,
  InvalidWorkerConfiguration,
  class MethodUnimplemented extends UnknownError {},
  class InvalidIdentifier extends UnknownError {},
  class InvalidSatisfiers extends InvalidWorkerConfiguration {},
  class InvalidConditions extends InvalidWorkerConfiguration {},
  class InvalidValues extends InvalidWorkerConfiguration {},
  class InvalidRules extends InvalidWorkerConfiguration {},
  class InvalidProvider extends UnknownError {},
  class InvalidDatastoreNamespace extends UnknownError {},
  class InvalidDatastoreKey extends UnknownError {},
  class InvalidDatastoreValue extends UnknownError {},
];

let x = {} 
for (let error of errors) {
  if (x[error.name]) {
    throw new Error('Duplicated Error: ' + error.name);
  }
  x[error.name] = error;
}

module.exports = new Proxy(x, {
  get: function (target, prop, receiver) {
    const e = Reflect.get(...arguments);
    if (!e) {
      throw new UnknownError('Unknown Error Type: ' + prop);
    }
    return e;
  }
});

