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
      Object.assign(properties);
    }
    this.code = this.constructor.name;
  }
};

const errors = [
  UnknownError,
  class MethodUnimplemented extends UnknownError {},
  class InvalidWorkerConfiguration extends UnknownError {},
  class InvalidSatisfiers extends UnknownError {},
  class InvalidProvider extends UnknownError {},
];

for (let error of errors) {
  if (module.exports[error.name]) {
    throw new Error('Duplicated Error: ' + error.name);
  }
  module.exports[error.name] = error;
}

