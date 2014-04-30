// ******************************************************************
// § 5.2. Validation keywords for strings
// ******************************************************************

var Errors = require('../../../errors.js');

module.exports = function(config) {
  var errors = [];
  if (!config.inst.match(new RegExp(config.schema.pattern))) {
    errors.push(new Errors.StringValidationError(config.resolutionScope,
      config.instanceContext, 'pattern', config.schema.pattern, config.inst));
  }
  return errors;
};
