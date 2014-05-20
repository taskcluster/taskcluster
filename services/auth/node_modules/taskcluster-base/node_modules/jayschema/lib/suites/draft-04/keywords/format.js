// ******************************************************************
// § 5.5. Validation keywords for any instance type
// ******************************************************************

var SUPPORTED_FORMATS = {
  'date-time': require('./formats/date-time.js'),
  'date': require('./formats/date.js'),
  'time': require('./formats/time.js'),
  'email': require('./formats/email.js'),
  'hostname': require('./formats/hostname.js'),
  'ipv4': require('./formats/ipv4.js'),
  'ipv6': require('./formats/ipv6.js'),
  'uri': require('./formats/uri.js')
};

module.exports = function(config) {
  var errors = [];

  if (SUPPORTED_FORMATS.hasOwnProperty(config.schema.format)) {
    errors = errors.concat(SUPPORTED_FORMATS[config.schema.format](config));
  }

  return errors;
};
