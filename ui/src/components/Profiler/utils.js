// @ts-check
/**
 * @param {any} any
 * @returns {any}
 */
export function asAny(any) {
  return any;
}

// The uint array encoding code is taken from:
// https://github.com/firefox-devtools/profiler/blob/e51f64485f85091e5c3f5fc692e69068b3324fbd/src/utils/uintarray-encoding.js

const ENCODING_DIGITS =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ._";
const LEADING_ZERO_DIGIT = ENCODING_DIGITS[0b100000];

/**
 * @param {Set<number>} numbers
 * @returns {string}
 */
export function encodeUintSetForUrlComponent(numbers) {
  // A set has no order. Convert it to an array and then sort the array,
  // so that consecutive numbers can be detected by encodeUintArrayForUrlComponent.
  const array = Array.from(numbers);
  array.sort((a, b) => a - b);
  return encodeUintArrayForUrlComponent(array);
}

/**
 * @param {number[]} numbers
 * @returns {string}
 */
export function encodeUintArrayForUrlComponent(numbers) {
  let result = "";
  for (let i = 0; i < numbers.length; i++) {
    const skipCount = countSkippableConsecutiveNumbersAt(numbers, i);
    if (skipCount === 0) {
      result += encodeUint(numbers[i]);
      continue;
    }

    i += skipCount;

    // We use the "leading zero digit" as the range marker.
    result += LEADING_ZERO_DIGIT;
    result += encodeUint(numbers[i]);
  }
  return result;
}

/**
 * @param {number[]} numbers
 * @param {number} start
 * @returns {number}
 */
function countSkippableConsecutiveNumbersAt(numbers, start) {
  if (start < 1 || start + 1 >= numbers.length) {
    return 0;
  }
  const previous = numbers[start - 1];
  const current = numbers[start];
  const next = numbers[start + 1];

  let skipCount = 0;
  if (current === previous + 1 && next === current + 1) {
    // Found increasing consecutive range.
    skipCount = 1;
    while (
      start + skipCount + 1 < numbers.length &&
      numbers[start + skipCount + 1] === current + skipCount + 1
    ) {
      skipCount++;
    }
  } else if (current === previous - 1 && next === current - 1) {
    // Found decreasing consecutive range.
    skipCount = 1;
    while (
      start + skipCount + 1 < numbers.length &&
      numbers[start + skipCount + 1] === current - skipCount - 1
    ) {
      skipCount++;
    }
  }
  return skipCount;
}

/**
 * @param {number} value
 * @returns {string}
 */
function encodeUint(value) {
  // Build the string digit by digit, back to front. The last digit has the
  // continuation bit set to 0, the other digits have it set to 1.
  // No "leading zero" digits are emitted, so that smaller numbers use fewer
  // digits, and so that "leading zero" digits can have special meaning.
  let x = value;
  let r = ENCODING_DIGITS[x & 0b11111];
  x >>= 5;
  while (x !== 0) {
    r = ENCODING_DIGITS[0b100000 + (x & 0b11111)] + r;
    x >>= 5;
  }
  return r;
}

/**
 * TODO - This needs the real server selection.
 */
export function getServer() {
  return "https://firefox-ci-tc.services.mozilla.com";
}

/**
 * TODO - Handle logging in the new Taskcluster UI.
 *
 * @param {any[]} args
 */
export function log(...args) {
  console.log(...args);
}
