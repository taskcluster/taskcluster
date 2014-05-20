
// ******************************************************************
// Equality as defined in the JSON Schema spec.
// ******************************************************************
function jsonEqual(x, y) {
  var index, len;

  if (Array.isArray(x)) {
    if (!Array.isArray(y)) { return false; }
    if (x.length !== y.length) { return false; }
    for (index = 0, len = x.length; index !== len; ++index) {
      if (!jsonEqual(x[index], y[index])) { return false; }
    }
    return true;
  }

  if (typeof x === 'object' && x !== null) {
    if (typeof y !== 'object' || y === null) { return false; }
    var xkeys = Object.keys(x);
    if (xkeys.length !== Object.keys(y).length) { return false; }
    for (index = 0, len = xkeys.length; index !== len; ++index) {
      var key = xkeys[index];
      if (!Object.prototype.hasOwnProperty.call(y, key) ||
        !jsonEqual(x[key], y[key]))
      {
        return false;
      }
    }
    return true;
  }

  return x === y;   // scalar value (boolean, string, number)
}
exports.jsonEqual = jsonEqual;

// ******************************************************************
// Given an instance value, get its apparent primitive type.
// ******************************************************************
function apparentType(val) {
  switch (typeof val) {
    case 'boolean':
    case 'string':
      return typeof val;

    case 'number':
      if (val % 1 === 0) { return 'integer'; }
      return 'number';

    default:
      if (val === null) { return 'null'; }
      if (Array.isArray(val)) { return 'array'; }
      return 'object';
  }
}
exports.apparentType = apparentType;

// ******************************************************************
// Helper function to get the value of a schema property.
// ******************************************************************
function getSchemaProperty(schema, propName, defaultValue) {
  if (Object.prototype.hasOwnProperty.call(schema, propName)) {
    return schema[propName];
  } else {
    return defaultValue;
  }
}
exports.getSchemaProperty = getSchemaProperty;

// ******************************************************************
// RegExps for use with the format keyword.
// ******************************************************************
exports.FORMAT_REGEXPS = {

  'date-time': new RegExp(
    '^' +
    '(\\d{4})\\-(\\d{2})\\-(\\d{2})' +        // full-date
    '[T ]' +
    '(\\d{2}):(\\d{2}):(\\d{2})(\\.\\d+)?' +  // partial-time
    '(Z|(?:([\\+|\\-])(\\d{2}):(\\d{2})))' +  // time-offset
    '$'
    ),

  date: new RegExp(
    '^' +
    '(\\d{4})\\-(\\d{2})\\-(\\d{2})' +
    '$'
    ),

  time: new RegExp(
    '^' +
    '(\\d{2}):(\\d{2}):(\\d{2})(\\.\\d+)?' +
    '$'
    ),

  hostname: new RegExp(
    '^' +
    '[A-Za-z0-9]' +         // must start with a letter or digit
    '(?:' +
      '[A-Za-z0-9-]*' +     // optional letters/digits/hypens
      '[A-Za-z0-9]' +       // must not end with a hyphen
    ')?' +
    '(?:' +
      '\\.' +
      '[A-Za-z0-9]' +       // must start with a letter or digit
      '(?:' +
        '[A-Za-z0-9-]*' +   // optional letters/digits/hypens
        '[A-Za-z0-9]' +     // must not end with a hyphen
      ')?' +
    ')*' +
    '$'
  ),

  email: new RegExp(
    '^' +
    '[A-Za-z0-9!#$%&\'*+=/?^_`{|}~-]+' +
      '(?:\\.[A-Za-z0-9!#$%&\'*+=/?^_`{|}~-]+)*' + // dot-atom
    '@' +
    '(' +
      '[A-Za-z0-9]' +         // must start with a letter or digit
      '(?:' +
        '[A-Za-z0-9-]*' +     // optional letters/digits/hypens
        '[A-Za-z0-9]' +       // must not end with a hyphen
      ')?' +
      '(?:' +
        '\\.' +
        '[A-Za-z0-9]' +       // must start with a letter or digit
        '(?:' +
          '[A-Za-z0-9-]*' +   // optional letters/digits/hypens
          '[A-Za-z0-9]' +     // must not end with a hyphen
        ')?' +
      ')*' +
    ')' +
    '$'
  ),

  ipv4: new RegExp(
    '^' +
    '(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[0-9]{1,2})' +
    '(?:' +
      '\\.' +
      '(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[0-9]{1,2})' +
    '){3}' +
    '$'
  ),

  ipv6: {
    allForms: new RegExp(
      '^' +
      '[0-9A-Fa-f\\:\\.]{2,45}' +
      '$'
    ),

    form1: new RegExp(
      '^' +
      '[0-9A-Fa-f]{1,4}' +
      '(?:' +
        ':' +
        '[0-9A-Fa-f]{1,4}' +
      '){7}' +
      '$'
    ),

    form3full: new RegExp(
      '^' +
      '(' +
        '[0-9A-Fa-f]{1,4}:' +
      '){6}' +
      '(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[0-9]{1,2})' +
      '(?:' +
        '\\.' +
        '(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[0-9]{1,2})' +
      '){3}' +
      '$'
    )
  },

  uri: new RegExp(
    '^' +
    '([A-Za-z][A-Za-z0-9+.-]*:/{0,3})?' +          // scheme
    '[A-Za-z0-9\\[\\]._~%!$&\'()*+,;=:@/-]*' +  // hier-part
    '(' +
      '[?][A-Za-z0-9._~%!$&\'()*+,;=:@/?-]*' +  // query
    ')?' +
    '(' +
      '#[A-Za-z0-9._~%!$&\'()*+,;=:@/?-]*' +    // fragment
    ')?' +
    '$'
  )
};
