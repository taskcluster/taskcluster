import type { ParsedQs } from 'qs';

/**
 * Normalizes a value parsed by qs into an array of strings (qs can return an
 * array, a string or an object).
 */
export default function queryParamToArray(value: ParsedQs[string]): string[] {
  if (value == null) {
    return [];
  }

  if (typeof value === 'string') {
    return [value];
  }

  return Object.values(value).filter(
    (item): item is string => typeof item === 'string'
  );
}
