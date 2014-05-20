// ******************************************************************
// Format keyword
// ******************************************************************

var Errors = require('../../../../errors.js')
  , core = require('../../core.js')
  ;

module.exports = function(config) {
  var errors = [];
  var valid = false;

  var match = config.inst.match(core.FORMAT_REGEXPS.time);

  if (match) {
    var hour = parseInt(match[1], 10);
    var min = parseInt(match[2], 10);
    var sec = parseInt(match[3], 10);

    if (
        hour >= 0 && hour <= 23 &&
        min >= 0 && min <= 59 &&
        sec >= 0 && sec <= 60       // it’s 60 during a leap second
       )
    {
      valid = true;
    }
  }

  if (!valid) {
    var desc = 'not a valid time';
    errors.push(new Errors.FormatValidationError(config.resolutionScope,
      config.instanceContext, 'format', 'time', config.inst, desc));
  }

  return errors;
};

