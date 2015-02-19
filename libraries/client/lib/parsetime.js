"use strict";

// Regular expression matching:
// A years B months C days D hours E minutes F seconds
var timeExp = new RegExp([
  '^(\\s*(-|\\+))?',
  '(\\s*(\\d+)\\s*y((ears?)|r)?)?',
  '(\\s*(\\d+)\\s*mo(nths?)?)?',
  '(\\s*(\\d+)\\s*w((eeks?)|k)?)?',
  '(\\s*(\\d+)\\s*d(ays?)?)?',
  '(\\s*(\\d+)\\s*h((ours?)|r)?)?',
  '(\\s*(\\d+)\\s*min(utes?)?)?',
  '(\\s*(\\d+)\\s*s(ec(onds?)?)?)?',
  '\\s*$'
].join(''), 'i');


/** Parse time string */
var parseTime = function(str) {
  // Parse the string
  var match = timeExp.exec(str || '');
  if (!match) {
    throw new Error("String: '" + str + "' isn't a time expression");
  }
  // Negate if needed
  var neg = (match[2] === '-' ? - 1 : 1);
  // Return parsed values
  return {
    years:    parseInt(match[4]   || 0) * neg,
    months:   parseInt(match[8]   || 0) * neg,
    weeks:    parseInt(match[11]  || 0) * neg,
    days:     parseInt(match[15]  || 0) * neg,
    hours:    parseInt(match[18]  || 0) * neg,
    minutes:  parseInt(match[22]  || 0) * neg,
    seconds:  parseInt(match[25]  || 0) * neg
  };
};

// Export parseTime
module.exports = parseTime;