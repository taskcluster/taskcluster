import parseTime from './parseTime';

/**
 * Create a Date object offset = '1d 2h 3min' into the future
 *
 * Offset format: The argument `offset` (if given) is a string on the form
 *   `1 day 2 hours 3 minutes`
 * where specification of day, hours and minutes is optional. You can also the
 * short hand `1d2h3min`, it's fairly tolerant of different spelling forms and
 * whitespace. But only really meant to be used with constants.
 */
export default (offset, reference = new Date()) => {
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
