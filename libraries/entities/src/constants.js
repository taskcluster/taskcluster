const COMPOSITE_SEPARATOR = '~';
const HASH_KEY_SEPARATOR = ':';
const SLUG_ID_RE = /^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$/i;
// SIZE of a slugid
const SLUGID_SIZE = 128 / 8;
// Padding for integers up to 2^32 be in ascending order.
// AscendingIntegerKey only works with PositiveInteger which is limited 2^32.
const ASCENDING_KEY_PADDING = '00000000000';
const MAX_MODIFY_ATTEMPTS = 10;
// More nines than an int can hold, ie. MORE_NINES_THAN_INT > 2^32
// DescendingIntegerKey only works with PositiveInteger which is limited 2^32.
const MORE_NINES_THAN_INT = 9999999999;
// Valid values for `options.matchPartition` in Entity.scan
const VALID_PARTITION_MATCH = ['exact', 'none'];

// Valid values for `options.matchRow` in Entity.scan and Entity.query
const VALID_ROW_MATCH = ['exact', 'partial', 'none'];
// a regular expression matching a continuation token; callers can use this to
// pre-screen invalid continuation tokens and offer a suitable error.
const CONTINUATION_TOKEN_PATTERN = /[a-zA-Z0-9]+/;

module.exports = {
  ASCENDING_KEY_PADDING,
  CONTINUATION_TOKEN_PATTERN,
  COMPOSITE_SEPARATOR,
  HASH_KEY_SEPARATOR,
  MORE_NINES_THAN_INT,
  SLUG_ID_RE,
  SLUGID_SIZE,
  MAX_MODIFY_ATTEMPTS,
  VALID_PARTITION_MATCH,
  VALID_ROW_MATCH,
};
