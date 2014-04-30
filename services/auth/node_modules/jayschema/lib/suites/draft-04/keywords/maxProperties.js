// ******************************************************************
// § 5.4. Validation keywords for objects
// ******************************************************************

var Errors = require('../../../errors.js');

module.exports = function(config) {
  var errors = [];

  if (Object.keys(config.inst).length > config.schema.maxProperties) {
    errors.push(new Errors.ObjectValidationError(config.resolutionScope,
      config.instanceContext, 'maxProperties', config.schema.maxProperties,
      Object.keys(config.inst).length));
  }

  return errors;
};
