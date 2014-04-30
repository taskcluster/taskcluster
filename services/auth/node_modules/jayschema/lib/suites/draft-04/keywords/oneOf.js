// ******************************************************************
// § 5.5. Validation keywords for any instance type
// ******************************************************************

var Errors = require('../../../errors.js')
  , testRunner = require('../index.js')
  ;

module.exports = function(config) {
  var errors = [], desc;
  var validAgainst = [];
  var subSchemaErrors = {};

  for (var index = 0; index < config.schema.oneOf.length; ++index) {
    var subTestConfig = {
      inst: config.inst,
      schema: config.schema.oneOf[index],
      resolutionScope: config.resolutionScope + '/oneOf/' + index,
      instanceContext: config.instanceContext,
      schemaRegistry: config.schemaRegistry
    };

    var nestedErrors = testRunner(subTestConfig);
    if (nestedErrors.length === 0) {
      validAgainst.push(config.resolutionScope + '/oneOf/' + index);
    } else {
      var key;
      if (Object.prototype.hasOwnProperty.call(config.schema.oneOf[index],
         '$ref'))
      {
        key = config.schema.oneOf[index].$ref;
      }
      if (!key) {
        key = subTestConfig.schema.id || 'sub-schema-' + (index + 1);
      }
      subSchemaErrors[key] = nestedErrors;
    }
  }

  if (validAgainst.length !== 1) {
    if (validAgainst.length === 0) {
      desc = 'does not validate against any of these schemas';
    } else {
      desc = 'validates against more than one of these schemas (' +
        validAgainst + ')';
    }
    desc += '; must validate against one and only one of them';

    errors.push(new Errors.SubSchemaValidationError(config.resolutionScope,
      config.instanceContext, 'oneOf', config.schema.oneOf, null, desc,
      validAgainst.length === 0 ? subSchemaErrors : null));
  }

  return errors;
};
