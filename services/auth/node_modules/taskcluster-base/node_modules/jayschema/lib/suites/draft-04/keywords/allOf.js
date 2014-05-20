// ******************************************************************
// § 5.5. Validation keywords for any instance type
// ******************************************************************

var testRunner = require('../index.js')
  ;

module.exports = function(config) {
  var errors = [];
  for (var index = 0; index < config.schema.allOf.length; ++index) {
    var schema = config.schema.allOf[index];

    var subTestConfig = {
      inst: config.inst,
      schema: schema,
      resolutionScope: config.resolutionScope + '/allOf/' + index,
      instanceContext: config.instanceContext,
      schemaRegistry: config.schemaRegistry
    };

    errors = errors.concat(testRunner(subTestConfig));
  }
  return errors;
};
