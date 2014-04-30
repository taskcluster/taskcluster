// ******************************************************************
// § 5.4. Validation keywords for objects
// ******************************************************************

var Errors = require('../../../errors.js');

module.exports = function(config) {
  var errors = [];

  if (Object.keys(config.inst).length < config.schema.minProperties) {
    errors.push(new Errors.ObjectValidationError(config.resolutionScope,
      config.instanceContext, 'minProperties', config.schema.minProperties,
      Object.keys(config.inst).length));
  }

  return errors;
};
