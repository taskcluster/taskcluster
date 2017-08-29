import { nice } from 'slugid';

// Regular expression matching:
// A years B months C days D hours E minutes F seconds
const timeExp = new RegExp([
  '^(\\s*(-|\\+))?',
  '(\\s*(\\d+)\\s*y((ears?)|r)?)?',
  '(\\s*(\\d+)\\s*mo(nths?)?)?',
  '(\\s*(\\d+)\\s*w((eeks?)|k)?)?',
  '(\\s*(\\d+)\\s*d(ays?)?)?',
  '(\\s*(\\d+)\\s*h((ours?)|r)?)?',
  '(\\s*(\\d+)\\s*min(utes?)?)?',
  '(\\s*(\\d+)\\s*s(ec(onds?)?)?)?',
  '\\s*$',
].join(''), 'i');

/** Parse time string */
export const parseTime = (str = '') => {
  // Parse the string
  const match = timeExp.exec(str);

  if (!match) {
    throw new Error(`String '${str}' is not a time expression`);
  }

  // Negate if needed
  const neg = match[2] === '-' ? -1 : 1;

  // Return parsed values
  return {
    years: parseInt(match[4] || 0, 10) * neg,
    months: parseInt(match[8] || 0, 10) * neg,
    weeks: parseInt(match[11] || 0, 10) * neg,
    days: parseInt(match[15] || 0, 10) * neg,
    hours: parseInt(match[18] || 0, 10) * neg,
    minutes: parseInt(match[22] || 0, 10) * neg,
    seconds: parseInt(match[25] || 0, 10) * neg,
  };
};

/**
 * Create a Date object offset = '1d 2h 3min' into the future
 *
 * Offset format: The argument `offset` (if given) is a string on the form
 *   `1 day 2 hours 3 minutes`
 * where specification of day, hours and minutes is optional. You can also the
 * short hand `1d2h3min`, it's fairly tolerant of different spelling forms and
 * whitespace. But only really meant to be used with constants.
 */
export const fromNow = (_offset = '', reference = new Date()) => {
  const offset = parseTime(_offset);
  const date = new Date(
    reference.getTime() +
    offset.weeks * 7 * 24 * 60 * 60 * 1000 +
    offset.days * 24 * 60 * 60 * 1000 +
    offset.hours * 60 * 60 * 1000 +
    offset.minutes * 60 * 1000 +
    offset.seconds * 1000
  );

  if (offset.months !== 0) {
    date.setMonth(date.getMonth() + offset.months);
  }

  if (offset.years !== 0) {
    date.setFullYear(date.getFullYear() + offset.years);
  }

  return date;
};

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
export const fromNowJSON = (offset, reference) => fromNow(offset, reference).toJSON();

// Export function to generate _nice_ slug ids
export const slugid = nice;
