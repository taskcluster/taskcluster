import { expect } from 'chai';
import { nice, v4 } from '../src';

/**
 * `spreader` runs a test against the `generator` function, to check that
 * when calling it 64*40 times, the range of characters per string position it
 * returns matches the array `actual`, where each entry in `expected` is a
 * string of all possible characters that should appear in that position in the
 * string, at least once in the sample of 64*40 responses from the `generator`
 * function */
const spreader = (generator) => {
  // k records which characters were found at which positions. It has one entry
  // per slugid character, therefore 22 entries. Each entry is an object with
  // a property for each character found, where the value of that property is
  // the number of times that character appeared at that position in the slugid
  // in the large sample of slugids generated in this test.
  const k = [[], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], []];

  // Generate a large sample of slugids, and record what characters appeared
  // where. A monte-carlo test has demonstrated that with 64 * 20
  // iterations, no failure occurred in 1000 simulations, so 64 * 40 should be
  // suitably large to rule out false positives.
  for (let i = 0; i < 64 * 40; i++) {
    const slug = generator();

    for (let j = 0; j < slug.length; j++) {
      const value = slug.charAt(j);

      if (k[j][value] === undefined) {
        k[j][value] = 1
      } else {
        k[j][value]++;
      }
    }
  }

  // Compose results into an array `actual`, for comparison with `expected`
  const actual = [];

  for (let j = 0; j < k.length; j++) {
    const a = Object.keys(k[j]);

    actual[j] = '';

    for (let x = 0; x < a.length; x++) {
      if (k[j][a[x]] > 0) {
        actual[j] += a[x]
      }
    }

    // sort for easy comparison
    actual[j] = actual[j].split('').sort().join('');
  }

  return actual;
};

describe('slugs', function() {

  it('should spread v4 slugs', () => {
    const charsAll = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'.split('').sort().join('');
    // 16, 17, 18, 19: 0b0100xx
    const charsD = 'QRST'.split('').sort().join('');
    // 2, 6, 10, 14, 18, 22, 26, 30, 34, 38, 42, 46, 50, 54, 58, 62: 0bxxxx10
    const charsE = 'CGKOSWaeimquy26-'.split('').sort().join('');
    // 0, 16, 32, 48: 0bxx0000
    const charsF = 'AQgw'.split('').sort().join('');
    const expected = [charsAll, charsAll, charsAll, charsAll, charsAll, charsAll, charsAll, charsAll, charsD, charsAll, charsE, charsAll, charsAll, charsAll, charsAll, charsAll, charsAll, charsAll, charsAll, charsAll, charsAll, charsF];
    const actual = spreader(v4);

    expect(expected).to.deep.equal(actual);
  });

  it('should spread nice slugs', () => {
    const charsAll = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'.split('').sort().join('');
    // 0 - 31: 0b0xxxxx
    const charsC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef'.split('').sort().join('');
    // 16, 17, 18, 19: 0b0100xx
    const charsD = 'QRST'.split('').sort().join('');
    // 2, 6, 10, 14, 18, 22, 26, 30, 34, 38, 42, 46, 50, 54, 58, 62: 0bxxxx10
    const charsE = 'CGKOSWaeimquy26-'.split('').sort().join('');
    // 0, 16, 32, 48: 0bxx0000
    const charsF = 'AQgw'.split('').sort().join('');
    const expected = [charsC, charsAll, charsAll, charsAll, charsAll, charsAll, charsAll, charsAll, charsD, charsAll, charsE, charsAll, charsAll, charsAll, charsAll, charsAll, charsAll, charsAll, charsAll, charsAll, charsAll, charsF];
    const actual = spreader(nice);

    expect(expected).to.deep.equal(actual);
  });
});
