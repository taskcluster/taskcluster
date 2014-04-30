//
// Error types for the JSON Schema validator.
//

'use strict';

var util = require('util')
  ;


// ******************************************************************
// Base error
// ******************************************************************

var ValidationError =
  function(resolutionScope, instanceContext, constraintName, constraintValue,
    testedValue, desc)
{
  Error.captureStackTrace(this, this.constructor);

  if (instanceContext) { this.instanceContext = instanceContext; }
  else { this.instanceContext = '#/'; }

  if (resolutionScope) { this.resolutionScope = resolutionScope; }
  if (constraintName) { this.constraintName = constraintName; }
  if (constraintValue) { this.constraintValue = constraintValue; }
  if (testedValue) { this.testedValue = testedValue; }
  if (desc) { this.desc = desc; }
};
util.inherits(ValidationError, Error);

// ******************************************************************
// More-specific error types
// ******************************************************************

var NumericValidationError = function() {
  ValidationError.apply(this, arguments);
  this.kind = 'NumericValidationError';
};
util.inherits(NumericValidationError, ValidationError);

var StringValidationError = function() {
  ValidationError.apply(this, arguments);
  this.kind = 'StringValidationError';
};
util.inherits(StringValidationError, ValidationError);

var ArrayValidationError = function() {
  ValidationError.apply(this, arguments);
  this.kind = 'ArrayValidationError';
};
util.inherits(ArrayValidationError, ValidationError);

var ObjectValidationError = function() {
  ValidationError.apply(this, arguments);
  this.kind = 'ObjectValidationError';
};
util.inherits(ObjectValidationError, ValidationError);

var FormatValidationError = function() {
  ValidationError.apply(this, arguments);
  this.kind = 'FormatValidationError';
};

var LoaderAsyncError = function() {
  ValidationError.apply(this, arguments);
  this.kind = 'LoaderAsyncError';
};
util.inherits(ObjectValidationError, ValidationError);

var SubSchemaValidationError = function() {
  ValidationError.apply(this, arguments);
  this.kind = 'SubSchemaValidationError';
  if (arguments.length > 6) {
    this.subSchemaValidationErrors = arguments[6];
  }
};
util.inherits(SubSchemaValidationError, ValidationError);

var SchemaLoaderError = function(ref, message, subError) {
  if (!message) {
    message = 'schema loader could not load schema for: ' + ref;
  }
  ValidationError.call(this, null, null, '$ref', ref, null, message);
  this.kind = 'SchemaLoaderError';
  if (subError) {
    this.subError = subError;
  }
};
util.inherits(SchemaLoaderError, ValidationError);


// ******************************************************************
// Exports
// ******************************************************************

exports.ValidationError = ValidationError;
exports.NumericValidationError = NumericValidationError;
exports.StringValidationError = StringValidationError;
exports.ArrayValidationError = ArrayValidationError;
exports.ObjectValidationError = ObjectValidationError;
exports.FormatValidationError = FormatValidationError;
exports.LoaderAsyncError = LoaderAsyncError;
exports.SubSchemaValidationError = SubSchemaValidationError;
exports.SchemaLoaderError = SchemaLoaderError;
