import { expect, it } from 'vitest';
import { AnsiParser } from './ansi';

const parse = (chunks: string[]) => {
  const parser = new AnsiParser();
  let text = '';
  const spans = [];

  for (const chunk of chunks) {
    const result = parser.push(chunk, text.length);

    text += result.text;

    for (const { from, to, value } of result.ranges) {
      spans.push([text.slice(from, to), value.spec.attributes.style]);
    }
  }

  return { text, spans };
};

it('styles basic, bright and bold colors', () => {
  expect(
    parse([
      'nothing\x1b[31mred\x1b[0m \x1b[1;32mbold\x1b[22m \x1b[94mbright\x1b[m',
    ])
  ).toEqual({
    text: 'nothingred bold bright',
    spans: [
      ['red', 'color: var(--log-ansi-1)'],
      ['bold', 'color: var(--log-ansi-10); font-weight: bold'],
      [' ', 'color: var(--log-ansi-2)'],
      ['bright', 'color: var(--log-ansi-12)'],
    ],
  });
});

it('styles backgrounds, italic and underline', () => {
  expect(parse(['\x1b[41;3;4mx\x1b[49;23;24my'])).toEqual({
    text: 'xy',
    spans: [
      [
        'x',
        'background-color: var(--log-ansi-1); font-style: italic; text-decoration: underline',
      ],
    ],
  });
});

it('supports 256 and truecolor colors', () => {
  expect(
    parse([
      '\x1b[38;5;208ma\x1b[48;5;244mb\x1b[0m\x1b[38;2;1;2;3mc\x1b[0;38;5;9md',
    ]).spans
  ).toEqual([
    ['a', 'color: rgb(255, 135, 0)'],
    ['b', 'color: rgb(255, 135, 0); background-color: rgb(128, 128, 128)'],
    ['c', 'color: rgb(1, 2, 3)'],
    ['d', 'color: var(--log-ansi-9)'],
  ]);
});

// This isn't specified but matches xterm
it('only brightens basic colors when bold', () => {
  expect(parse(['\x1b[1;38;5;1ma\x1b[31mb']).spans).toEqual([
    ['a', 'color: var(--log-ansi-1); font-weight: bold'],
    ['b', 'color: var(--log-ansi-9); font-weight: bold'],
  ]);
});

it('styles colon separated 256 and truecolor colors', () => {
  expect(
    parse([
      '\x1b[38:5:208ma\x1b[48:2::1:2:3mb\x1b[0m\x1b[38:2:4:5:6mc\x1b[38:2:0:7:8:9md',
    ]).spans
  ).toEqual([
    ['a', 'color: rgb(255, 135, 0)'],
    ['b', 'color: rgb(255, 135, 0); background-color: rgb(1, 2, 3)'],
    ['c', 'color: rgb(4, 5, 6)'],
    ['d', 'color: rgb(7, 8, 9)'],
  ]);
});

// This isn't specified but matches xterm
it('ignores out of range or incomplete extended colors', () => {
  expect(
    parse([
      '\x1b[31m\x1b[38;5;300ma\x1b[48;2;999;0;0mb\x1b[38;2;10mc\x1b[38:2:10:20md',
    ]).spans
  ).toEqual([
    ['a', 'color: var(--log-ansi-1)'],
    ['b', 'color: var(--log-ansi-1)'],
    ['c', 'color: var(--log-ansi-1)'],
    ['d', 'color: var(--log-ansi-1)'],
  ]);
});

// This isn't specified but matches xterm
it('skips the parameters of invalid or unsupported extended colors', () => {
  expect(parse(['\x1b[38;5;300;4ma\x1b[0;38;3;1mb']).spans).toEqual([
    ['a', 'text-decoration: underline'],
    ['b', 'font-weight: bold'],
  ]);
});

// This isn't specified but matches xterm
it('records underline styles and ignores unknown subparameters', () => {
  expect(parse(['\x1b[31;4:3ma\x1b[58:2::1:2:3mb\x1b[4:0mc']).spans).toEqual([
    ['a', 'color: var(--log-ansi-1); text-decoration: underline'],
    ['b', 'color: var(--log-ansi-1); text-decoration: underline'],
    ['c', 'color: var(--log-ansi-1)'],
  ]);
});

it('deletes the previous character of the line on backspace', () => {
  expect(parse(['abc\bd\n\bx\b\b\by', '\nzz\b'])).toEqual({
    text: 'abd\ny\nz',
    spans: [],
  });
});

it('deletes styled characters on backspace', () => {
  expect(
    parse(['\x1b[31mab\x1b[32mc\x1b[0m\b\b\x1b[34m\bd\x1b[31me\b'])
  ).toEqual({
    text: 'd',
    spans: [['d', 'color: var(--log-ansi-4)']],
  });
});

it('deletes whole surrogate pairs on backspace', () => {
  expect(parse(['a😀\bb\x1b[31m😀😀\bc'])).toEqual({
    text: 'ab😀c',
    spans: [
      ['😀', 'color: var(--log-ansi-1)'],
      ['c', 'color: var(--log-ansi-1)'],
    ],
  });
});

it('keeps a style across calls', () => {
  expect(parse(['\x1b[31mre', 'd\x1b[0m'])).toEqual({
    text: 'red',
    spans: [
      ['re', 'color: var(--log-ansi-1)'],
      ['d', 'color: var(--log-ansi-1)'],
    ],
  });
});

it('strips non-SGR escape sequences', () => {
  expect(parse(['\x1b[74G[ OK ]']).text).toBe('[ OK ]');
  expect(
    parse(['\x1b[2K\x1b[?25la\x1b]0;title\x07b\x1b(Bc\x1b]8;;http://x\x1b\\d'])
      .text
  ).toBe('abcd');
  expect(parse(['a\x1b=b\x1b>c\x1b7d\x1b8e\x1bMf\x1bcg']).text).toBe('abcdefg');
  expect(parse(['a\x1b)0b\x1b*Bc\x1b$)Ad']).text).toBe('abcd');
});

it('ends an unterminated OSC at the end of the line', () => {
  expect(parse(['a\x1b]0;title\nline2\nline3\x07 end']).text).toBe(
    'a\nline2\nline3\x07 end'
  );
  expect(parse(['a\x1b]0;title']).text).toBe('a');
});

it('leaves an unfinished escape sequence as text', () => {
  expect(parse(['a\x1b[3']).text).toBe('a\x1b[3');
});

it('skips the parameters of semicolon separated underline colors', () => {
  expect(parse(['\x1b[31;58;2;1;2;3ma\x1b[58;5;3mb']).spans).toEqual([
    ['a', 'color: var(--log-ansi-1)'],
    ['b', 'color: var(--log-ansi-1)'],
  ]);
});

it('ignores private sequences ending with a m', () => {
  expect(parse(['\x1b[31m\x1b[>4;2ma\x1b[?1ma']).spans).toEqual([
    ['a', 'color: var(--log-ansi-1)'],
    ['a', 'color: var(--log-ansi-1)'],
  ]);
});
