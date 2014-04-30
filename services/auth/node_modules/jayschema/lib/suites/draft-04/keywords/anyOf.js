// ******************************************************************
// § 5.5. Validation keywords for any instance type
// ******************************************************************

var Errors = require('../../../errors.js')
  , testRunner = require('../index.js')
  ;

module.exports = function(config) {

  var errors = [];
  var subSchemaErrors = {};

  for (var index = 0, len = config.schema.anyOf.length; index !== len; ++index)
  {
    var subTestConfig = {
      inst: config.inst,
      schema: config.schema.anyOf[index],
      resolutionScope: config.resolutionScope + '/anyOf/' + index,
      instanceContext: config.instanceContext,
      schemaRegistry: config.schemaRegistry
    };

    var nestedErrors = testRunner(subTestConfig);

    if (nestedErrors.length === 0) {
      return errors;
    } else {
      var key;
      if (Object.prototype.hasOwnProperty.call(config.schema.anyOf[index],
        '$ref'))
       {
        key = config.schema.anyOf[index].$ref;
      }
      if (!key) {
        key = subTestConfig.schema.id || 'sub-schema-' + (index + 1);
      }
      subSchemaErrors[key] = nestedErrors;
    }
  }

  errors.push(new Errors.SubSchemaValidationError(config.resolutionScope,
    config.instanceContext, 'anyOf', config.schema.anyOf, null, 'does not ' +
    'validate against any of these schemas; it must validate against at ' +
    'least one', subSchemaErrors));

  return errors;
};
