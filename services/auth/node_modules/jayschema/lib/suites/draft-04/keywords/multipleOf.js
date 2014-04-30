// ******************************************************************
// § 5.1. Validation keywords for numeric instances
// ******************************************************************

var Errors = require('../../../errors.js');

module.exports = function(config) {
  var errors = [];
  var intermediate = config.inst / config.schema.multipleOf;
  if (intermediate % 1) {
    errors.push(new Errors.NumericValidationError(config.resolutionScope,
      config.instanceContext, 'multipleOf', config.schema.multipleOf,
      config.inst));
  }
  return errors;
};
