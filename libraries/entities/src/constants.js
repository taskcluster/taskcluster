const COMPOSITE_SEPARATOR = '~';
const HASH_KEY_SEPARATOR = ':';
const SLUG_ID_RE = /^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$/i;
// Padding for integers up to 2^32 be in ascending order.
// AscendingIntegerKey only works with PositiveInteger which is limited 2^32.
const ASCENDING_KEY_PADDING = '00000000000';

module.exports = {
  ASCENDING_KEY_PADDING,
  COMPOSITE_SEPARATOR,
  HASH_KEY_SEPARATOR,
  SLUG_ID_RE,
};
