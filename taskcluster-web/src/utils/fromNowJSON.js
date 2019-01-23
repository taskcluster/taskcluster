import fromNow from './fromNow';

/**
 * Create an ISO 8601 time stamp offset = '1d 2h 3min' into the future
 *
 * This returns a time stamp in the format expected by the cluster.
 * Compatible with Date.toJSON() from Javascript. These time stamps are string
 * that with UTC as timezone.
 *
 * Offset format: The argument `offset` (if given) is a string on the form
 *   `1 day 2 hours 3 minutes`
 * where specification of day, hours and minutes is optional. You can also the
 * short hand `1d2h3min`, it's fairly tolerant of different spelling forms and
 * whitespace. But only really meant to be used with constants.
 */
export default (offset, reference) => fromNow(offset, reference).toJSON();
