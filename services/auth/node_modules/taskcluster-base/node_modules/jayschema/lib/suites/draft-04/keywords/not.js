// ******************************************************************
// § 5.5. Validation keywords for any instance type
// ******************************************************************

var Errors = require('../../../errors.js')
  , testRunner = require('../index.js')
  ;

module.exports = function(config) {
  var errors = [];

  var subTestConfig = {
    inst: config.inst,
    schema: config.schema.not,
    resolutionScope: config.resolutionScope + '/not',
    instanceContext: config.instanceContext,
    schemaRegistry: config.schemaRegistry
  };

  if (testRunner(subTestConfig).length === 0) {
    var desc = 'validates against this schema; must NOT validate against ' +
      'this schema';
    errors.push(new Errors.ValidationError(config.resolutionScope,
      config.instanceContext, 'not', config.schema.not, null, desc));
  }
  return errors;
};
