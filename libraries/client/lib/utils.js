"use strict";

// Regular expression matching: X days Y hours Z minutes
var timeExp = /^(\s*(\d+)\s*d(ays?)?)?(\s*(\d+)\s*h(ours?)?)?(\s*(\d+)\s*m(in(utes?)?)?)?\s*$/;

/** Parse time string */
var parseTime = function(str) {
  // Parse the string
  var match = timeExp.exec(str || '');
  if (!match) {
    throw new Error("String: '" + str + "' isn't a time expression");
  }
  // Return parsed values
  return {
    days:     parseInt(match[2] || 0),
    hours:    parseInt(match[5] || 0),
    minutes:  parseInt(match[8] || 0)
  };
};

// Export parseTime
exports.parseTime = parseTime;

/**
 * Convert time offset object (from parseTime) to Date object relative to
 * reference.
 */
var relativeTime = function(offset, reference) {
  if (reference === undefined) {
    reference = new Date();
  }
  if (!offset || typeof(offset) === 'string') {
    offset = parseTime(offset);
  }
  return new Date(
    reference.getTime()
    + offset.days * 24 * 60 * 60 * 1000
    + offset.hours     * 60 * 60 * 1000
    + offset.minutes        * 60 * 1000
  );
};

// Export relativeTime
exports.relativeTime = relativeTime;

/**
 * Create an ISO 8601 time stamp offset = '1d 2h 3m' into the future
 *
 * This returns a time stamp in the format expected by taskcluster.
 * Compatible with Date.toJSON() from Javascript. These time stamps are string
 * that with UTC as timezone.
 *
 * Offset format: The argument `offset` (if given) is a string on the form
 *   `1 day 2 hours 3 minutes`
 * where specification of day, hours and minutes is optional. You can also the
 * short hand `1d2h3m`, it's fairly tolerant of different spelling forms and
 * whitespace. But only really meant to be used with constants.
 */
var fromNow = function(offset) {
  return relativeTime(offset).toJSON();
};

// Export fromNow
exports.fromNow = fromNow;
