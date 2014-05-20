// ******************************************************************
// § 5.3. Validation keywords for arrays
// ******************************************************************

var Errors = require('../../../errors.js');

module.exports = function(config) {
  var errors = [];
  if (config.inst.length > config.schema.maxItems) {
    errors.push(new Errors.ArrayValidationError(config.resolutionScope,
      config.instanceContext, 'maxItems', config.schema.maxItems,
      config.inst.length));
  }
  return errors;
};
