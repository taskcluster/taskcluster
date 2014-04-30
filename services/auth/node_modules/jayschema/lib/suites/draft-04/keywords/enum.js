// ******************************************************************
// § 5.5. Validation keywords for any instance type
// ******************************************************************

var Errors = require('../../../errors.js')
  , core = require('../core.js')
  ;

module.exports = function(config) {
  var errors = [];
  for (var index = 0, len = config.schema['enum'].length; index !== len;
    ++index)
  {
    if (core.jsonEqual(config.inst, config.schema['enum'][index])) {
      return errors;
    }
  }

  errors.push(new Errors.ValidationError(config.resolutionScope,
    config.instanceContext, 'enum', config.schema['enum'], config.inst));

  return errors;
};
