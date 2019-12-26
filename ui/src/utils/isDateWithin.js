import { parseISO, differenceInMinutes } from 'date-fns';

/*
 * If date is within the specified time interval in minutes.
 * Else, returns false.
 *
 * date - the date that should be within the specified time interval.
 * dateToCompare - the date to compare with.
 * startInMinutes - the lower bound of the interval in minutes
 * endInMinutes - the upper bound of the interval in minutes
 */
export default (date, dateToCompare, startInMinutes, endInMinutes) => {
  const d = typeof date === 'string' ? parseISO(date) : date;
  const compareAgainst =
    typeof dateToCompare === 'string' ? parseISO(dateToCompare) : dateToCompare;
  const difference = Math.abs(differenceInMinutes(compareAgainst, d));

  return difference > startInMinutes && difference < endInMinutes;
};
