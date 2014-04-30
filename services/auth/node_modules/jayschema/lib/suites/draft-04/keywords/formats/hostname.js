// ******************************************************************
// Format keyword
// ******************************************************************

var Errors = require('../../../../errors.js')
  , core = require('../../core.js')
  ;

module.exports = function(config) {
  var errors = [];

  var valid = config.inst.match(core.FORMAT_REGEXPS.hostname);
  if (valid) {
    // per RFC 1035 “Preferred name syntax” each label must be no
    // more than 63 characters.
    var labels = config.inst.split('.');
    for (var index = 0, len = labels.length; valid && index !== len; ++index) {
      if (labels[index].length > 63) { valid = false; }
    }

    // the final label must not start with a digit
    if (labels[labels.length - 1].match(/^[0-9]/)) {
      valid = false;
    }
  }

  if (!valid) {
    var desc = 'not a valid hostname per RFC 1034 Preferred Name Syntax';
    errors.push(new Errors.FormatValidationError(config.resolutionScope,
      config.instanceContext, 'format', 'hostname', config.inst, desc));
  }

  return errors;
};
