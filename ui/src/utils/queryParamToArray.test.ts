import { parse, stringify } from 'qs';
import { describe, expect, it } from 'vitest';
import queryParamToArray from './queryParamToArray';

describe('queryParamToArray', () => {
  const scopes = Array.from({ length: 50 }, (_, i) => `scope-${i}`);

  it('returns an empty array for a missing parameter', () => {
    expect(queryParamToArray(parse('').scope)).toEqual([]);
  });

  it('wraps a single parameter', () => {
    expect(queryParamToArray(parse('scope=a').scope)).toEqual(['a']);
  });

  it('handles more than 20 repeated params', () => {
    const search = scopes.map(scope => `scope=${scope}`).join('&');

    expect(queryParamToArray(parse(search).scope)).toEqual(scopes);
  });

  it('handles more than 20 indexed params', () => {
    expect(queryParamToArray(parse(stringify({ scopes })).scopes)).toEqual(
      scopes
    );
  });

  it('handles non-numeric keys', () => {
    expect(queryParamToArray(parse('scope[foo]=a&scope[0]=b').scope)).toEqual([
      'b',
      'a',
    ]);
  });
});
