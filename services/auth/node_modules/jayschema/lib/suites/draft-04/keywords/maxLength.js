// ******************************************************************
// § 5.2. Validation keywords for strings
// ******************************************************************

var Errors = require('../../../errors.js');

module.exports = function(config) {
  var errors = [];
  if (config.inst.length > config.schema.maxLength) {
    errors.push(new Errors.StringValidationError(config.resolutionScope,
      config.instanceContext, 'maxLength', config.schema.maxLength,
      config.inst.length));
  }
  return errors;
};
