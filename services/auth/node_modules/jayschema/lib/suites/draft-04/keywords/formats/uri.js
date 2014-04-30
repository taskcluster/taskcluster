// ******************************************************************
// Format keyword
// ******************************************************************

var Errors = require('../../../../errors.js')
  , core = require('../../core.js')
  ;

module.exports = function(config) {
  var errors = [];

  if (!config.inst.match(core.FORMAT_REGEXPS.uri)) {
    var desc = 'not a valid URI';
    errors.push(new Errors.FormatValidationError(config.resolutionScope,
      config.instanceContext, 'format', 'uri', config.inst, desc));
  }

  return errors;
};
