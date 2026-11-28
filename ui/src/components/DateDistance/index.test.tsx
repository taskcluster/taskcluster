import { render } from '@testing-library/react';
import { addMinutes } from 'date-fns';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import DateDistance from '.';

const now = new Date('2026-11-26T19:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});

afterEach(() => {
  vi.useRealTimers();
});

const text = (from: string | Date, offset?: string | Date) =>
  render(<DateDistance from={from} offset={offset} />).container.textContent;

it('should use minutes between one and two hours', () => {
  expect(text(addMinutes(now, -30))).toEqual('30 minutes ago');
  expect(text(addMinutes(now, -90))).toEqual('90 minutes ago');
  expect(text(addMinutes(now, 90))).toEqual('in 90 minutes');
  expect(text(addMinutes(now, -150))).toEqual('3 hours ago');
  expect(text(new Date(now.getTime() - 30_000))).toEqual('30 seconds ago');
});

it('should parse ISO strings', () => {
  expect(text(addMinutes(now, -90).toISOString())).toEqual('90 minutes ago');
});

it('should pick the offset unit independently', () => {
  const from = addMinutes(now, -60);

  expect(text(from, addMinutes(from, 300))).toEqual(
    '60 minutes ago (5 hours later)'
  );
  expect(text(addMinutes(now, -300), addMinutes(now, -210))).toEqual(
    '5 hours ago (90 minutes later)'
  );
});
