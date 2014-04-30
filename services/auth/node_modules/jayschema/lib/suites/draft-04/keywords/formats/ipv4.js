// ******************************************************************
// Format keyword
// ******************************************************************

var Errors = require('../../../../errors.js')
  , core = require('../../core.js')
  ;

module.exports = function(config) {
  var errors = [];

  if (!config.inst.match(core.FORMAT_REGEXPS.ipv4)) {
    var desc = 'not a valid dotted-quad IPv4 address';
    errors.push(new Errors.FormatValidationError(config.resolutionScope,
      config.instanceContext, 'format', 'ipv4', config.inst, desc));
  }

  return errors;
};
