// ******************************************************************
// § 5.3. Validation keywords for arrays
// ******************************************************************

var Errors = require('../../../errors.js');

module.exports = function(config)
{
  var errors = [];

  // always succeeds in these conditions
  if (config.schema.additionalItems === true ||
      typeof config.schema.additionalItems === 'object' ||
      !Object.prototype.hasOwnProperty.call(config.schema, 'items') ||
      typeof config.schema.items === 'object' &&
        !Array.isArray(config.schema.items))
  {
    return errors;
  }

  // config.schema.items must be an Array if we’ve reached this point

  if (config.schema.additionalItems === false &&
      config.inst.length > config.schema.items.length)
  {
    var desc = 'array length (' + config.inst.length + ') is greater than ' +
      '"items" length (' + config.schema.items.length + ') and ' +
      '"additionalItems" is false';
    errors.push(new Errors.ArrayValidationError(config.resolutionScope,
      config.instanceContext, 'additionalItems', null, null, desc));
  }

  return errors;
};

