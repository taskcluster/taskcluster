import type { LineRange } from './editor';

const LINE_HASH = /^#L([1-9]\d*)(?:-L?([1-9]\d*))?$/;

export const parseLineHash = (hash: string): LineRange | null => {
  const match = LINE_HASH.exec(hash);
  if (!match) {
    return null;
  }

  const first = Number(match[1]);
  const last = match[2] ? Number(match[2]) : first;

  return { start: Math.min(first, last), end: Math.max(first, last) };
};

export const formatLineHash = (range: LineRange | null) => {
  if (!range) {
    return '';
  }

  return range.start === range.end
    ? `#L${range.start}`
    : `#L${range.start}-${range.end}`;
};

export const sameRange = (a: LineRange | null, b: LineRange | null) =>
  a === b ||
  (a !== null && b !== null && a.start === b.start && a.end === b.end);
