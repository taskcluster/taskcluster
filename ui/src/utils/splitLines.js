import { filter, map, pipe, split, trim, uniq } from 'ramda';

/**
 * Splits a string into an array of strings using newlines as a separator.
 * Returns an array with unique values.
 */
export default pipe(split(/[\r\n]+/), map(trim), filter(Boolean), uniq);
