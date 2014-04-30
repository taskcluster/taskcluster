//
// Validation suite for JSON objects against a JSON Schema Draft v4
// schema. Each test returns an array (possibly empty) of errors.
//

'use strict';

var core = require('./core.js')
  , Errors = require('../../errors.js')
  , uri = require('../../uri.js')
  ;

// ******************************************************************
// Categories of properties we can validate.
// ******************************************************************
var PROPS_TO_VALIDATE = {
  general: ['enum', 'allOf', 'anyOf', 'oneOf', 'not'],
  array: ['items', 'additionalItems', 'maxItems', 'minItems', 'uniqueItems'],
  number: ['multipleOf', 'maximum', 'exclusiveMaximum', 'minimum',
      'exclusiveMinimum'],
  object: ['maxProperties', 'minProperties', 'required',
      'additionalProperties', 'properties', 'patternProperties',
      'dependencies'],
  string: ['maxLength', 'minLength', 'pattern', 'format']
};

// ******************************************************************
// Return a set of tests to apply to the instance.
// ******************************************************************
function getApplicableTests(config) {
  var result = [];
  var len, i, key;

  // general tests that apply to all types
  for (i = 0, len = PROPS_TO_VALIDATE.general.length; i !== len; ++i) {
    key = PROPS_TO_VALIDATE.general[i];
    if (Object.prototype.hasOwnProperty.call(config.schema, key)) {
      result.push(key);
    }
  }

  // type-specific tests
  var apparentType = core.apparentType(config.inst);
  if (apparentType === 'integer') { apparentType = 'number'; }
  var props = PROPS_TO_VALIDATE[apparentType] || [];
  for (i = 0, len = props.length; i !== len; ++i)
  {
    key = props[i];
    if (Object.prototype.hasOwnProperty.call(config.schema, key)) {
      result.push(key);
    }
  }

  // for objects, the properties, patternProperties, and
  // additionalProperties validations are inseperable
  if (result.indexOf('properties') !== -1 ||
      result.indexOf('patternProperties') !== -1 ||
      result.indexOf('additionalProperties') !== -1)
  {
    result.push('_propertiesImpl');
  }

  return result;
}

// ******************************************************************
// Run all applicable tests.
//
// config values:
//
//   inst: instance to validate
//   schema: schema to validate against
//   resolutionScope: resolutionScope,
//   instanceContext: current position within the overall instance
//   schemaRegistry: a SchemaRegistry
//
// ******************************************************************
function run(config)
{
  var errors = [];
  var desc;

  var maxRefDepth = 10;   // avoid infinite loops
  var depth = 0;

  while (depth < maxRefDepth &&
         config.schema &&
         Object.prototype.hasOwnProperty.call(config.schema, '$ref'))
  {
    var ref = uri.resolve(config.resolutionScope,
      decodeURI(config.schema.$ref));
    config.schema = config.schemaRegistry.get(ref);

    if (!config.schema) {
      desc = 'schema not available: ' + ref;
      errors.push(new Errors.ValidationError(null, null, null, null, null,
        desc));
      return errors;
    }

    config.resolutionScope = ref;
    depth++;

    if (depth >= maxRefDepth) {
      desc = 'maximum nested $ref depth of ' + maxRefDepth + ' exceeded; ' +
        'possible $ref loop';
      errors.push(new Errors.ValidationError(null, config.instanceContext,
        '$ref', null, null, desc));
      return errors;
    }
  }

  // empty schema - bail early
  if (Object.keys(config.schema).length === 0) { return errors; }

  // validate the type: if it isn't valid we can bail early
  errors = errors.concat(require('./keywords/type.js')(config));
  if (errors.length) { return errors; }

  // test all applicable schema properties
  var props = getApplicableTests(config);
  for (var index = 0; index < props.length; ++index) {
    var prop = props[index];
    var fn = require('./keywords/' + prop + '.js');
    errors = errors.concat(fn(config));
  }
  return errors;
}

module.exports = run;
