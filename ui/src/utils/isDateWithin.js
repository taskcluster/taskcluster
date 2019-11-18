import { parseISO, differenceInMinutes } from 'date-fns';

export default (date, startInMinutes, endInMinutes) => {
  const d = typeof date === 'string' ? parseISO(date) : date;
  const difference = Math.abs(differenceInMinutes(new Date(), d));

  return difference > startInMinutes && difference < endInMinutes;
};
