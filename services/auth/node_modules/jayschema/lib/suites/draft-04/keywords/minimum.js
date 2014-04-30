// ******************************************************************
// § 5.1. Validation keywords for numeric instances
// ******************************************************************

var Errors = require('../../../errors.js');

module.exports = function(config) {
  var errors = [];
  if (config.inst < config.schema.minimum) {
    errors.push(new Errors.NumericValidationError(config.resolutionScope,
      config.instanceContext, 'minimum', config.schema.minimum, config.inst));
  }
  return errors;
};

