import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import render from '../../utils/renderWithTheme';
import { parseLineHash } from './hash';
import Log from './index';

vi.mock('../../utils/db', () => ({
  default: {
    table: () => ({ get: async () => undefined, put: async () => {} }),
  },
}));

const streamResponse = (chunks: string[], init?: ResponseInit) =>
  new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }

        controller.close();
      },
    }),
    init
  );

const pushableResponse = () => {
  let push: (chunk: string) => void = () => {};
  const response = new Response(
    new ReadableStream({
      start(controller) {
        push = chunk => controller.enqueue(new TextEncoder().encode(chunk));
      },
    })
  );

  return { response, push: (chunk: string) => push(chunk) };
};
const lines = () =>
  [...document.querySelectorAll('.cm-line')].map(line => line.textContent);

// jsdom has no layout, and codemirror measures text ranges
beforeAll(() => {
  Range.prototype.getClientRects = () =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('streams the log, joining lines across chunks', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      streamResponse(['one\r', '\ntw', 'o \x1b[31mred', '\x1b[0m\nthree\n'])
    )
  );
  render(<Log url="https://example.com/log" />);

  await waitFor(() => expect(lines()).toEqual(['one', 'two red', 'three']));
  expect(
    document.querySelector('.cm-line span[style]')?.getAttribute('style')
  ).toBe('color: var(--log-ansi-1);');
});

it('shows lines ending in a carriage return before the log ends', async () => {
  const { response, push } = pushableResponse();

  vi.stubGlobal(
    'fetch',
    vi.fn(async () => response)
  );
  render(<Log url="https://example.com/log" />);

  push('10%\r20%\r');
  await waitFor(() => expect(lines()).toEqual(['10%']));
  push('\n30%\r');
  await waitFor(() => expect(lines()).toEqual(['10%', '20%']));
});

it('highlights lines from the hash', async () => {
  const highlighted = () =>
    [...document.querySelectorAll('.cm-line.cm-log-highlight')].map(
      line => line.textContent
    );

  vi.stubGlobal(
    'fetch',
    vi.fn(async () => streamResponse(['a\nb\nc\nd\n']))
  );

  const { rerender } = render(
    <Log url="https://example.com/log" hash="#L2-3" />
  );

  await waitFor(() => expect(highlighted()).toEqual(['b', 'c']));

  rerender(<Log url="https://example.com/log" hash="#L4" />);
  await waitFor(() => expect(highlighted()).toEqual(['d']));
});

it('counts search matches', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => streamResponse(['Error: x\nok\nanother error\n']))
  );
  render(<Log url="https://example.com/log" />);

  await waitFor(() => expect(lines()).toHaveLength(3));
  fireEvent.change(screen.getByLabelText('Search log'), {
    target: { value: 'error' },
  });

  expect(await screen.findByText('2 matches')).toBeTruthy();
});

it.each([
  ['#L12', { start: 12, end: 12 }],
  ['#L20-L12', { start: 12, end: 20 }],
  ['#L0', null],
  ['#foo-L3', null],
])('parses the line hash %s', (hash, range) => {
  expect(parseLineHash(hash)).toEqual(range);
});
