import { differenceInMinutes, formatDistanceStrict, parseISO } from 'date-fns';

export interface DateDistanceProps {
  /** The origin date for which to render a relative string from now. */
  from: string | Date;
  /**
   * An optional date for which to also show a relative string between `from`
   * and `offset`.
   */
  offset?: string | Date | null;
}

const toDate = (date: string | Date) =>
  typeof date === 'string' ? parseISO(date) : date;

// formatDistanceStrict rounds to hours past 60 minutes, so 90 minutes would be
// displayed as "2 hours".
const unitFor = (a: Date, b: Date) => {
  const minutes = Math.abs(differenceInMinutes(a, b));

  return minutes >= 60 && minutes < 120 ? 'minute' : undefined;
};

/**
 * Display a human-readable relative string between a date and now.
 * Optionally also show a relative distance between that date and an
 * additional offset date.
 */
export default function DateDistance({ from, offset }: DateDistanceProps) {
  const now = new Date();
  const fromDate = toDate(from);
  const fromNow = formatDistanceStrict(fromDate, now, {
    addSuffix: true,
    unit: unitFor(fromDate, now),
  });

  if (!offset) {
    return fromNow;
  }

  const offsetDate = toDate(offset);
  const offsetNow = formatDistanceStrict(fromDate, offsetDate, {
    unit: unitFor(fromDate, offsetDate),
  });

  return `${fromNow} (${offsetNow} later)`;
}
