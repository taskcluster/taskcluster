"use strict";

var parseTime = require('./parsetime');
var slugid    = require('slugid');

/**
 * Create a Date object offset = '1d 2h 3min' into the future
 *
 * Offset format: The argument `offset` (if given) is a string on the form
 *   `1 day 2 hours 3 minutes`
 * where specification of day, hours and minutes is optional. You can also the
 * short hand `1d2h3min`, it's fairly tolerant of different spelling forms and
 * whitespace. But only really meant to be used with constants.
 */
var fromNow = function(offset, reference) {
  if (reference === undefined) {
    reference = new Date();
  }
  offset = parseTime(offset || '');

  offset.days += 30 * offset.months;
  offset.days += 365 * offset.years;

  var retval = new Date(
    reference.getTime()
//    + offset.years * 365 * 24 * 60 * 60 * 1000
 //   + offset.month  * 30 * 24 * 60 * 60 * 1000
    + offset.weeks   * 7 * 24 * 60 * 60 * 1000
    + offset.days        * 24 * 60 * 60 * 1000
    + offset.hours            * 60 * 60 * 1000
    + offset.minutes               * 60 * 1000
    + offset.seconds                    * 1000
  );
  return retval;
};

// Export fromNow
exports.fromNow = fromNow;

/**
 * Create an ISO 8601 time stamp offset = '1d 2h 3min' into the future
 *
 * This returns a time stamp in the format expected by taskcluster.
 * Compatible with Date.toJSON() from Javascript. These time stamps are string
 * that with UTC as timezone.
 *
 * Offset format: The argument `offset` (if given) is a string on the form
 *   `1 day 2 hours 3 minutes`
 * where specification of day, hours and minutes is optional. You can also the
 * short hand `1d2h3min`, it's fairly tolerant of different spelling forms and
 * whitespace. But only really meant to be used with constants.
 */
var fromNowJSON = function(offset, reference) {
  return fromNow(offset, reference).toJSON();
};

// Export fromNowJSON
exports.fromNowJSON = fromNowJSON;

// Export function to generate _nice_ slugids
exports.slugid = function() {
  return slugid.nice();
};
