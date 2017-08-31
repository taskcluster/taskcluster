// Regular expression matching:
// A years B months C days D hours E minutes F seconds
const timeExpression = new RegExp([
  '^(\\s*(-|\\+))?',
  '(\\s*(\\d+)\\s*y((ears?)|r)?)?',
  '(\\s*(\\d+)\\s*mo(nths?)?)?',
  '(\\s*(\\d+)\\s*w((eeks?)|k)?)?',
  '(\\s*(\\d+)\\s*d(ays?)?)?',
  '(\\s*(\\d+)\\s*h((ours?)|r)?)?',
  '(\\s*(\\d+)\\s*m(in(utes?)?)?)?',
  '(\\s*(\\d+)\\s*s(ec(onds?)?)?)?',
  '\\s*$'
].join(''), 'i');

export const parseTime = (str = '') => {
  // Parse the string
  const match = timeExpression.exec(str);

  if (!match) {
    throw new Error(`"${str}" is not a valid time expression`);
  }

  // Negate if needed
  const neg = (match[2] === '-' ? - 1 : 1);

  // Return parsed values
  return {
    years: parseInt(match[4] || 0) * neg,
    months: parseInt(match[8] || 0) * neg,
    weeks: parseInt(match[11] || 0) * neg,
    days: parseInt(match[15] || 0) * neg,
    hours: parseInt(match[18] || 0) * neg,
    minutes: parseInt(match[22] || 0) * neg,
    seconds: parseInt(match[25] || 0) * neg
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
export const fromNow = (offset, reference = new Date()) => {
  const parsedOffset = parseTime(offset || '');

  parsedOffset.days += 30 * parsedOffset.months;
  parsedOffset.days += 365 * parsedOffset.years;

  return new Date(
    reference.getTime() +
    parsedOffset.weeks * 7 * 24 * 60 * 60 * 1000 +
    parsedOffset.days * 24 * 60 * 60 * 1000 +
    parsedOffset.hours * 60 * 60 * 1000 +
    parsedOffset.minutes * 60 * 1000 +
    parsedOffset.seconds * 1000
  );
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

export const uuid = () => ([1e7]+-1e3+-4e3+-8e3+-1e11)
  .replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4)
    .toString(16));

const slug = (nice = false) => {
  const bytes = uuid();

  if (nice) {
    bytes[0] = bytes[0] & 0x7f; // unset first bit to ensure [A-Za-f] first char
  }

  return btoa(bytes)
    .replace(/\+/g, '-') // Replace + with - (see RFC 4648, sec. 5)
    .replace(/\//g, '_') // Replace / with _ (see RFC 4648, sec. 5)
    .substring(0, 22); // Drop '==' padding
};

/**
 * Returns a randomly generated uuid v4 compliant slug
 */
export const v4 = slug;

/**
 * Returns a randomly generated uuid v4 compliant slug which conforms to a set
 * of "nice" properties, at the cost of some entropy. Currently this means one
 * extra fixed bit (the first bit of the uuid is set to 0) which guarantees the
 * slug will begin with [A-Za-f]. For example such slugs don't require special
 * handling when used as command line parameters (whereas non-nice slugs may
 * start with `-` which can confuse command line tools).
 *
 * Potentially other "nice" properties may be added in future to further
 * restrict the range of potential uuids that may be generated.
 */
export const nice = () => slug(true);
export const slugid = nice;
