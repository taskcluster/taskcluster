// ******************************************************************
// § 5.3. Validation keywords for arrays
// ******************************************************************

var Errors = require('../../../errors.js')
  , core = require('../core.js')

module.exports = function(config) {
  var errors = [];

  if (config.schema.uniqueItems === true) {
    for (var x = 0; x < config.inst.length; ++x) {
      var item = config.inst[x];
      for (var y = x + 1; y < config.inst.length; ++y) {
        if (core.jsonEqual(item, config.inst[y])) {
          errors.push(new Errors.ArrayValidationError(config.resolutionScope,
            config.instanceContext, 'uniqueItems', true, null,
            'failed at index ' + x));
          break;
        }
      }
    }
  }

  return errors;
};
