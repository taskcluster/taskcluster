/* eslint-disable no-bitwise, no-mixed-operators */
export const uuid = () => {
  const randoms = crypto.getRandomValues(new Uint8Array(16));

  randoms[6] = (randoms[6] & 0x0f) | 0x40;
  randoms[8] = (randoms[8] & 0x3f) | 0x80;

  return randoms;
};

const slug = (nice = false) => {
  const bytes = uuid();

  if (nice) {
    bytes[0] &= 0x7f; // unset first bit to ensure [A-Za-f] first char
  }

  return btoa(String.fromCharCode.apply(null, bytes))
    .replace(/\+/g, '-') // Replace + with - (see RFC 4648, sec. 5)
    .replace(/\//g, '_') // Replace / with _ (see RFC 4648, sec. 5)
    .substring(0, 22); // Drop '==' padding
};
/* eslint-enable no-bitwise, no-mixed-operators */

/**
 * Returns a randomly generated uuid v4 compliant slug
 */
export const v4 = slug;

/**
 * Returns a randomly generated uuid v4 compliant slug which conforms to a set
 * of "nice" properties, at the cost of some entropy. Currently this means one
 * extra fixed bit (the first bit of the uuid is set to 0) which guarantees the
 * slug will begin with [A-Za-f]. For example such slugs don't require special
 * handling when used as command line parameters (whereas non-nice slugs may
 * start with `-` which can confuse command line tools).
 *
 * Potentially other "nice" properties may be added in future to further
 * restrict the range of potential uuids that may be generated.
 */
export const nice = () => slug(true);
export const slugid = nice;
