// ******************************************************************
// Format keyword
// ******************************************************************

var Errors = require('../../../../errors.js')
  , core = require('../../core.js')
  ;

module.exports = function(config) {
  var errors = [];
  var valid = config.inst.match(core.FORMAT_REGEXPS.email);
  if (!valid) {
    var desc = 'not a valid email address';
    errors.push(new Errors.FormatValidationError(config.resolutionScope,
      config.instanceContext, 'format', 'email', config.inst, desc));
  }
  return errors;
};
