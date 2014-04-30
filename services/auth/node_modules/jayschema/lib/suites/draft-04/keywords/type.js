// ******************************************************************
// § 5.5. Validation keywords for any instance type
// ******************************************************************

var Errors = require('../../../errors.js')
  , core = require('../core.js')
  ;

module.exports = function(config) {
  var errors = [];

  if (!Object.prototype.hasOwnProperty.call(config.schema, 'type')) {
    return errors;
  }

  var types = Array.isArray(config.schema.type) ? config.schema.type :
    [config.schema.type];
  var instanceType = core.apparentType(config.inst);

  if (instanceType === 'integer') {
    if (types.indexOf('integer') === -1 && types.indexOf('number') === -1) {
      errors.push(new Errors.ValidationError(config.resolutionScope,
        config.instanceContext, 'type', config.schema.type, instanceType));
    }
  } else {
    // boolean, string, number, null, array, object
    if (types.indexOf(instanceType) === -1) {
      errors.push(new Errors.ValidationError(config.resolutionScope,
        config.instanceContext, 'type', config.schema.type, instanceType));
    }
  }

  return errors;
};
